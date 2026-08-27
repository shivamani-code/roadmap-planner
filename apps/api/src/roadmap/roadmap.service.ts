import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  generateRoadmap,
  type RoadmapSkillInput,
  type RoadmapTermInput,
} from "@studentos/planning";
import { uuidV7 } from "@studentos/domain";
import { DatabaseService } from "../config/database.service.js";

const DAY_MS = 86_400_000;
const ROADMAP_RULESET = "roadmap-1.0.0";

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function buildTerms(input: {
  start: Date;
  deadline: Date;
  currentSemester: number;
  weeklyMinutes: number;
}): RoadmapTermInput[] {
  const terms: RoadmapTermInput[] = [];
  let cursor = new Date(
    Date.UTC(
      input.start.getUTCFullYear(),
      input.start.getUTCMonth(),
      input.start.getUTCDate(),
    ),
  );
  const deadline = new Date(
    Date.UTC(
      input.deadline.getUTCFullYear(),
      input.deadline.getUTCMonth(),
      input.deadline.getUTCDate(),
    ),
  );
  while (cursor <= deadline && terms.length < 16) {
    const sequence = terms.length + 1;
    const end = new Date(
      Math.min(addDays(cursor, 111).getTime(), deadline.getTime()),
    );
    const weeks = Math.max(
      1,
      Math.ceil((end.getTime() - cursor.getTime() + DAY_MS) / (7 * DAY_MS)),
    );
    const semesterNumber = input.currentSemester + sequence - 1;
    terms.push({
      id: `term-${sequence}`,
      label:
        semesterNumber <= 8
          ? `Semester ${semesterNumber}`
          : `Placement term ${sequence}`,
      sequence,
      semesterNumber: semesterNumber <= 8 ? semesterNumber : null,
      startDate: dateOnly(cursor),
      endDate: dateOnly(end),
      capacityMinutes: Math.floor(input.weeklyMinutes * 0.85 * weeks),
    });
    cursor = addDays(end, 1);
  }
  return terms;
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function responseRoadmap(roadmap: {
  id: string;
  status: string;
  activeRevision: null | {
    id: string;
    version: number;
    status: string;
    rulesetVersion: string;
    summary: unknown;
    exclusions: unknown;
    risks: unknown;
    activatedAt: Date | null;
    gapAnalysis: null | { items: Array<{ trace: unknown }> };
    terms: Array<{
      id: string;
      sequence: number;
      semesterNumber: number | null;
      label: string;
      theme: string;
      startDate: Date;
      endDate: Date;
      capacityMinutes: number;
      plannedMinutes: number;
      milestones: Array<{ track: string; skillId: string }>;
    }>;
  };
}) {
  if (!roadmap.activeRevision) return null;
  const milestones = roadmap.activeRevision.terms.flatMap(
    (term) => term.milestones,
  );
  const subjectNames = new Map<string, string>();
  for (const item of roadmap.activeRevision.gapAnalysis?.items ?? []) {
    const trace = jsonRecord(item.trace);
    const key =
      typeof trace.subjectCode === "string"
        ? trace.subjectCode
        : typeof trace.topicKey === "string"
          ? trace.topicKey
          : null;
    if (key)
      subjectNames.set(
        key,
        typeof trace.subjectTitle === "string" ? trace.subjectTitle : key,
      );
  }
  const firstTerm = roadmap.activeRevision.terms[0];
  const lastTerm = roadmap.activeRevision.terms.at(-1);
  const durationWeeks =
    firstTerm && lastTerm
      ? Math.max(
          1,
          Math.ceil(
            (lastTerm.endDate.getTime() - firstTerm.startDate.getTime()) /
              (7 * DAY_MS),
          ),
        )
      : 1;
  const plannedMinutes = roadmap.activeRevision.terms.reduce(
    (total, term) => total + term.plannedMinutes,
    0,
  );
  return {
    id: roadmap.id,
    status: roadmap.status,
    revision: {
      id: roadmap.activeRevision.id,
      version: roadmap.activeRevision.version,
      status: roadmap.activeRevision.status,
      rulesetVersion: roadmap.activeRevision.rulesetVersion,
      summary: {
        ...jsonRecord(roadmap.activeRevision.summary),
        termCount: roadmap.activeRevision.terms.length,
        milestoneCount: milestones.length,
        skillCount: new Set(milestones.map(({ skillId }) => skillId)).size,
        projectMilestoneCount: milestones.filter(
          ({ track }) => track === "PROJECT",
        ).length,
        supportingSubjectCount: subjectNames.size,
        supportingSubjectNames: [...subjectNames.values()].slice(0, 8),
        weeklyPaceMinutes: Math.ceil(plannedMinutes / durationWeeks),
      },
      exclusions: roadmap.activeRevision.exclusions,
      risks: roadmap.activeRevision.risks,
      activatedAt: roadmap.activeRevision.activatedAt,
    },
    terms: roadmap.activeRevision.terms.map((term) => ({
      id: term.id,
      sequence: term.sequence,
      semesterNumber: term.semesterNumber,
      label: term.label,
      theme: term.theme,
      startDate: term.startDate,
      endDate: term.endDate,
      capacityMinutes: term.capacityMinutes,
      plannedMinutes: term.plannedMinutes,
      tracks: [...new Set(term.milestones.map(({ track }) => track))],
      milestoneCount: term.milestones.length,
    })),
  };
}

@Injectable()
export class RoadmapService {
  constructor(private readonly database: DatabaseService) {}

  async generate(
    userId: string,
    gapAnalysisId: string,
    idempotencyKey: string,
  ) {
    const priorByKey = await this.database.client.generationJob.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (priorByKey) return this.jobResponse(userId, priorByKey.id);

    const gap = await this.database.client.gapAnalysis.findFirst({
      where: { id: gapAnalysisId, userId },
      include: {
        goal: true,
        availability: true,
        curriculumProgram: true,
        careerDataset: true,
        items: { include: { requirement: true } },
      },
    });
    if (!gap)
      throw new NotFoundException({
        code: "GAP_ANALYSIS_NOT_FOUND",
        message: "Gap analysis was not found",
      });
    if (gap.status !== "READY")
      throw new UnprocessableEntityException({
        code: "INSUFFICIENT_CAPACITY",
        message: `The selected deadline and availability leave a ${gap.deficitMinutes}-minute capacity shortfall. Extend the target date or increase weekly availability before generating a roadmap.`,
        deficitMinutes: gap.deficitMinutes,
        requiredMinutes: gap.requiredMinutes,
        allocatableMinutes: gap.allocatableMinutes,
      });
    const profile = await this.database.client.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile?.currentSemester)
      throw new UnprocessableEntityException({
        code: "ACADEMIC_PROFILE_REQUIRED",
        message: "A current semester is required",
      });
    const currentSemester = profile.currentSemester;
    const latestGap = await this.database.client.gapAnalysis.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (latestGap?.id !== gap.id || gap.goal.status !== "ACTIVE")
      throw new ConflictException({
        code: "STALE_ANALYSIS",
        message: "Recalculate the gap after changing an input",
      });
    const existingRoadmap = await this.database.client.roadmap.findUnique({
      where: { goalId: gap.goalId },
    });
    if (existingRoadmap?.activeRevisionId)
      throw new ConflictException({
        code: "ACTIVE_ROADMAP_EXISTS",
        message: "Use a roadmap revision to change an active roadmap",
      });

    const terms = buildTerms({
      start: gap.createdAt,
      deadline: gap.goal.deadline,
      currentSemester: profile.currentSemester,
      weeklyMinutes: gap.availability.weeklyMinutes,
    });
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          gapAnalysisId: gap.id,
          gapInputHash: gap.inputHash,
          availabilityId: gap.availabilityId,
          rulesetVersion: ROADMAP_RULESET,
          terms,
        }),
      )
      .digest("hex");
    const priorByInput = await this.database.client.generationJob.findUnique({
      where: { userId_inputHash: { userId, inputHash } },
    });
    if (priorByInput) return this.jobResponse(userId, priorByInput.id);

    const job = await this.database.client.generationJob.create({
      data: {
        id: uuidV7(),
        userId,
        gapAnalysisId: gap.id,
        idempotencyKey,
        inputHash,
        status: "RUNNING",
        stage: "MAPPING",
        attemptCount: 1,
        startedAt: new Date(),
      },
    });
    try {
      const [skills, prerequisiteEdges, estimates] = await Promise.all([
        this.database.client.skill.findMany({
          where: { datasetId: gap.careerDatasetId },
          include: {
            learningUnitLinks: { include: { learningUnit: true } },
          },
          orderBy: { stableKey: "asc" },
        }),
        this.database.client.skillPrerequisite.findMany({
          where: { skill: { datasetId: gap.careerDatasetId } },
        }),
        this.database.client.studentSkill.findMany({
          where: { userId, skill: { datasetId: gap.careerDatasetId } },
        }),
      ]);
      const itemBySkill = new Map(
        gap.items.map((item) => [item.skillId, item]),
      );
      const estimateBySkill = new Map(
        estimates.map((estimate) => [estimate.skillId, estimate]),
      );
      const edgesBySkill = new Map<string, typeof prerequisiteEdges>();
      for (const edge of prerequisiteEdges)
        edgesBySkill.set(edge.skillId, [
          ...(edgesBySkill.get(edge.skillId) ?? []),
          edge,
        ]);
      const roadmapSkills: RoadmapSkillInput[] = skills.map((skill) => {
        const item = itemBySkill.get(skill.id);
        const requirement = item?.requirement;
        const estimate = estimateBySkill.get(skill.id);
        const requiredBy = requirement
          ? addDays(
              gap.goal.deadline,
              -requirement.requiredByDaysBeforeDeadline,
            )
          : addDays(gap.goal.deadline, -240);
        const trace = item?.trace as { semester?: unknown } | undefined;
        const mappedSemester =
          typeof trace?.semester === "number" ? trace.semester : undefined;
        const horizonDays = Math.max(
          1,
          (gap.goal.deadline.getTime() - gap.createdAt.getTime()) / DAY_MS,
        );
        const daysUntilRequired = Math.max(
          0,
          (requiredBy.getTime() - gap.createdAt.getTime()) / DAY_MS,
        );
        return {
          skillId: skill.id,
          stableKey: skill.stableKey,
          name: skill.name,
          required: requirement?.required ?? false,
          importance: requirement ? Number(requirement.importance) : 0.6,
          placementRelevance: requirement
            ? Number(requirement.placementRelevance)
            : 0.4,
          requiredDepth: requirement ? Number(requirement.requiredDepth) : 0.4,
          effectiveProficiency:
            estimate?.effectiveProficiency === null ||
            estimate?.effectiveProficiency === undefined
              ? null
              : Number(estimate.effectiveProficiency),
          evidenceConfidence: estimate ? Number(estimate.confidence) : 0,
          remainingMinutes: item
            ? Math.ceil(Number(item.effortP50Hours) * 60)
            : Math.max(
                0,
                ...skill.learningUnitLinks.map(
                  ({ learningUnit }) => learningUnit.estimatedMinutes,
                ),
              ),
          requiredBy: dateOnly(requiredBy),
          deadlineUrgency: 1 - Math.min(1, daysUntilRequired / horizonDays),
          academicSync: item ? Math.min(1, Number(item.collegeRatio) * 2) : 0,
          studentWeakness:
            1 -
            (estimate?.effectiveProficiency
              ? Number(estimate.effectiveProficiency)
              : 0),
          ...(mappedSemester
            ? {
                academicTermSequence: Math.max(
                  1,
                  mappedSemester - currentSemester + 1,
                ),
              }
            : {}),
          ...(requirement ? { roleRequirementId: requirement.id } : {}),
          prerequisites: (edgesBySkill.get(skill.id) ?? []).map((edge) => ({
            skillId: edge.prerequisiteId,
            type: edge.type,
          })),
          learningUnits: skill.learningUnitLinks.map(({ learningUnit }) => ({
            id: learningUnit.id,
            stableKey: learningUnit.stableKey,
            title: learningUnit.stableKey.replaceAll(".", " "),
            type: learningUnit.type,
            estimatedMinutes: learningUnit.estimatedMinutes,
            fromDepth: Number(learningUnit.fromDepth),
            toDepth: Number(learningUnit.toDepth),
            reasonCodes: jsonArray(learningUnit.reasonCodes),
          })),
        };
      });
      await this.database.client.generationJob.update({
        where: { id: job.id },
        data: { stage: "SCHEDULING" },
      });
      const result = generateRoadmap({
        rulesetVersion: ROADMAP_RULESET,
        skills: roadmapSkills,
        terms,
      });
      if (result.status !== "READY") {
        await this.database.client.generationJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            stage: "DECISION_REQUIRED",
            errorCode: result.status,
            errorDetail: JSON.stringify(result.risks).slice(0, 1000),
            completedAt: new Date(),
          },
        });
        throw new UnprocessableEntityException({
          code: result.status,
          message:
            result.status === "INVALID_CONTENT"
              ? "Reviewed learning content is missing"
              : "Required milestones do not fit before their deadlines",
          risks: result.risks,
          exclusions: result.exclusions,
        });
      }
      const roadmapId = existingRoadmap?.id ?? uuidV7();
      const revisionId = uuidV7();
      await this.database.client.$transaction(async (transaction) => {
        if (!existingRoadmap) {
          await transaction.roadmap.create({
            data: {
              id: roadmapId,
              userId,
              goalId: gap.goalId,
              status: "ACTIVE",
            },
          });
        }
        await transaction.roadmapRevision.create({
          data: {
            id: revisionId,
            roadmapId,
            version: 1,
            status: "READY",
            trigger: "INITIAL_GENERATION",
            gapAnalysisId: gap.id,
            availabilityId: gap.availabilityId,
            curriculumProgramId: gap.curriculumProgramId,
            careerDatasetId: gap.careerDatasetId,
            rulesetVersion: ROADMAP_RULESET,
            seed: gap.inputHash.slice(0, 64),
            inputHash,
            inputSnapshot: {
              gapAnalysisId: gap.id,
              gapInputHash: gap.inputHash,
              academicProfileVersion: profile.lockVersion,
              curriculumProgramId: gap.curriculumProgramId,
              curriculumDatasetVersion: gap.curriculumProgram.datasetVersion,
              careerDatasetId: gap.careerDatasetId,
              careerDatasetVersion: gap.careerDataset.datasetVersion,
              availabilityId: gap.availabilityId,
              goalId: gap.goalId,
              roleVersionId: gap.goal.roleVersionId,
              targetLevel: gap.goal.targetLevel,
              deadline: gap.goal.deadline,
              calendarBasis: "DETERMINISTIC_16_WEEK_TERMS",
              rulesetVersion: ROADMAP_RULESET,
            },
            summary: result.summary,
            exclusions: result.exclusions,
            risks: result.risks,
            generatedAt: new Date(),
          },
        });
        const termIdByLogical = new Map<string, string>();
        for (const term of result.terms) {
          const termId = uuidV7();
          termIdByLogical.set(term.id, termId);
          const leading = result.milestones.find(
            ({ termId: id }) => id === term.id,
          );
          await transaction.roadmapTerm.create({
            data: {
              id: termId,
              revisionId,
              sequence: term.sequence,
              semesterNumber: term.semesterNumber,
              label: term.label,
              theme: leading
                ? `Build ${leading.skillKey.replaceAll(".", " ")}`
                : "Protected capacity",
              startDate: new Date(`${term.startDate}T00:00:00.000Z`),
              endDate: new Date(`${term.endDate}T00:00:00.000Z`),
              capacityMinutes: term.capacityMinutes,
              plannedMinutes: term.plannedMinutes,
            },
          });
        }
        const milestoneIdBySkill = new Map<string, string>();
        for (const milestone of result.milestones) {
          const milestoneId = uuidV7();
          milestoneIdBySkill.set(milestone.skillId, milestoneId);
          await transaction.roadmapMilestone.create({
            data: {
              id: milestoneId,
              termId: termIdByLogical.get(milestone.termId)!,
              skillId: milestone.skillId,
              learningUnitTemplateId: milestone.learningUnitId,
              sourceRequirementId: milestone.sourceRequirementId,
              stableKey: milestone.id,
              title: milestone.title,
              track: milestone.track,
              status: "PLANNED",
              estimatedMinutes: milestone.estimatedMinutes,
              priority: milestone.priority,
              requiredBy: new Date(`${milestone.requiredBy}T00:00:00.000Z`),
              reasonCodes: milestone.reasonCodes,
              sourceTrace: {
                gapAnalysisId: gap.id,
                skillId: milestone.skillId,
                roleRequirementId: milestone.sourceRequirementId,
                learningUnitTemplateId: milestone.learningUnitId,
                rulesetVersion: ROADMAP_RULESET,
              },
            },
          });
        }
        for (const milestone of result.milestones) {
          const milestoneId = milestoneIdBySkill.get(milestone.skillId)!;
          for (const prerequisiteSkillId of milestone.prerequisiteSkillIds) {
            const prerequisiteId = milestoneIdBySkill.get(prerequisiteSkillId);
            if (prerequisiteId)
              await transaction.roadmapMilestoneDependency.create({
                data: { milestoneId, prerequisiteId },
              });
          }
        }
        const activatedAt = new Date();
        await transaction.roadmapRevision.update({
          where: { id: revisionId },
          data: { status: "ACTIVE", activatedAt },
        });
        await transaction.roadmap.update({
          where: { id: roadmapId },
          data: { activeRevisionId: revisionId },
        });
        await transaction.generationJob.update({
          where: { id: job.id },
          data: {
            roadmapId,
            revisionId,
            status: "COMPLETED",
            stage: "ACTIVATED",
            completedAt: activatedAt,
          },
        });
        await transaction.studentProfile.update({
          where: { userId },
          data: { onboardingStatus: "COMPLETE" },
        });
        await transaction.outboxEvent.create({
          data: {
            id: uuidV7(),
            aggregateType: "RoadmapRevision",
            aggregateId: revisionId,
            eventType: "roadmap.activated.v1",
            payload: {
              roadmapId,
              revisionId,
              version: 1,
              rulesetVersion: ROADMAP_RULESET,
            },
          },
        });
      });
      return this.jobResponse(userId, job.id);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      await this.database.client.generationJob.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          stage: "FAILED",
          errorCode: "GENERATION_FAILED",
          errorDetail:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Unknown generation failure",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async jobResponse(userId: string, id: string) {
    const job = await this.database.client.generationJob.findFirst({
      where: { id, userId },
    });
    if (!job)
      throw new NotFoundException({
        code: "GENERATION_JOB_NOT_FOUND",
        message: "Generation job was not found",
      });
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      attemptCount: job.attemptCount,
      error: job.errorCode
        ? { code: job.errorCode, detail: job.errorDetail }
        : null,
      roadmapId: job.roadmapId,
      revisionId: job.revisionId,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }

  async current(userId: string) {
    const roadmap = await this.database.client.roadmap.findFirst({
      where: { userId, activeRevisionId: { not: null } },
      include: {
        activeRevision: {
          include: {
            terms: {
              include: {
                milestones: { select: { track: true, skillId: true } },
              },
              orderBy: { sequence: "asc" },
            },
            gapAnalysis: { include: { items: { select: { trace: true } } } },
          },
        },
      },
    });
    const response = roadmap ? responseRoadmap(roadmap) : null;
    if (!response)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "No active roadmap exists",
      });
    return response;
  }

  async term(userId: string, termId: string) {
    const term = await this.database.client.roadmapTerm.findFirst({
      where: {
        id: termId,
        revision: { activeForRoadmap: { is: { userId } } },
      },
      include: {
        milestones: {
          include: {
            skill: true,
            learningUnitTemplate: true,
            prerequisites: { include: { prerequisite: true } },
          },
          orderBy: [{ priority: "desc" }, { stableKey: "asc" }],
        },
      },
    });
    if (!term)
      throw new NotFoundException({
        code: "ROADMAP_TERM_NOT_FOUND",
        message: "Roadmap term was not found",
      });
    return {
      id: term.id,
      sequence: term.sequence,
      semesterNumber: term.semesterNumber,
      label: term.label,
      theme: term.theme,
      startDate: term.startDate,
      endDate: term.endDate,
      capacityMinutes: term.capacityMinutes,
      plannedMinutes: term.plannedMinutes,
      milestones: term.milestones.map((milestone) => ({
        id: milestone.id,
        stableKey: milestone.stableKey,
        title: milestone.title,
        track: milestone.track,
        status: milestone.status,
        skill: {
          id: milestone.skill.id,
          key: milestone.skill.stableKey,
          name: milestone.skill.name,
        },
        learningUnit: {
          id: milestone.learningUnitTemplate.id,
          key: milestone.learningUnitTemplate.stableKey,
          type: milestone.learningUnitTemplate.type,
        },
        estimatedMinutes: milestone.estimatedMinutes,
        priority: Number(milestone.priority),
        requiredBy: milestone.requiredBy,
        reasonCodes: milestone.reasonCodes,
        sourceTrace: milestone.sourceTrace,
        prerequisiteMilestoneIds: milestone.prerequisites.map(
          ({ prerequisiteId }) => prerequisiteId,
        ),
      })),
    };
  }
}
