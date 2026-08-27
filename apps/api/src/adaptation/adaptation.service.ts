import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  calculateAdaptiveLoad,
  diffRoadmapTasks,
  resolvePlanningMode,
  revisionConsent,
  type ExamMode,
  type RevisionTaskInput,
  type WeeklyDifficulty as PlanningDifficulty,
} from "@studentos/planning";
import { uuidV7 } from "@studentos/domain";
import { Prisma, type RevisionKind } from "@studentos/database";
import { DatabaseService } from "../config/database.service.js";
import { PlannerService } from "../planner/planner.service.js";

const DAY_MS = 86_400_000;
const REVISION_RULESET = "adaptation-1.0.0";

function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new UnprocessableEntityException({
      code: "INVALID_DATE",
      message: "Dates must use YYYY-MM-DD",
    });
  const result = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  )
    throw new UnprocessableEntityException({
      code: "INVALID_DATE",
      message: "Date is invalid",
    });
  return result;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function weekStart(value: Date): Date {
  const date = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY_MS);
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.min(1, numerator / denominator);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function splitMinutes(total: number, maximum: number): number[] {
  const result: number[] = [];
  let remaining = total;
  while (remaining >= 10) {
    let next = Math.min(maximum, remaining);
    if (remaining - next > 0 && remaining - next < 10)
      next -= 10 - (remaining - next);
    result.push(next);
    remaining -= next;
  }
  return result;
}

function taskState(
  occurrences: readonly { status: string }[],
  satisfiedByCompletionId: string | null = null,
): RevisionTaskInput["state"] {
  if (satisfiedByCompletionId) return "COMPLETED";
  if (occurrences.some(({ status }) => status === "COMPLETED"))
    return "COMPLETED";
  if (occurrences.some(({ status }) => status === "PARTIAL")) return "PARTIAL";
  if (occurrences.some(({ status }) => status === "IN_PROGRESS"))
    return "IN_PROGRESS";
  return "PLANNED";
}

@Injectable()
export class AdaptationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly planner: PlannerService,
  ) {}

  async listExamPeriods(userId: string) {
    const periods = await this.database.client.examPeriod.findMany({
      where: { userId },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    return periods.map((period) => ({
      id: period.id,
      type: period.type,
      title: period.title,
      startDate: dateString(period.startDate),
      endDate: dateString(period.endDate),
      provenance: period.provenance,
      confirmed: period.confirmed,
      sourceReference: period.sourceReference,
    }));
  }

  async createExamPeriod(
    userId: string,
    input: {
      type: Exclude<ExamMode, "NORMAL">;
      title: string;
      startDate: string;
      endDate: string;
    },
  ) {
    const startDate = dateOnly(input.startDate);
    const endDate = dateOnly(input.endDate);
    const duration = (endDate.getTime() - startDate.getTime()) / DAY_MS + 1;
    if (endDate < startDate || duration > 180)
      throw new UnprocessableEntityException({
        code: "INVALID_EXAM_PERIOD",
        message: "Exam periods must be ordered and no longer than 180 days",
      });
    const period = await this.database.client.examPeriod.create({
      data: {
        id: uuidV7(),
        userId,
        type: input.type,
        title: input.title,
        startDate,
        endDate,
        provenance: "STUDENT",
        confirmed: true,
      },
    });
    await this.database.client.outboxEvent.create({
      data: {
        id: uuidV7(),
        aggregateType: "ExamPeriod",
        aggregateId: period.id,
        eventType: "planning.exam-period-confirmed.v1",
        payload: {
          userId,
          type: period.type,
          startDate: input.startDate,
          endDate: input.endDate,
        },
      },
    });
    return {
      id: period.id,
      type: period.type,
      title: period.title,
      startDate: input.startDate,
      endDate: input.endDate,
      provenance: period.provenance,
      confirmed: period.confirmed,
    };
  }

  async confirmExamPeriod(
    userId: string,
    periodId: string,
    confirmed: boolean,
  ) {
    const period = await this.database.client.examPeriod.findFirst({
      where: { id: periodId, userId },
    });
    if (!period)
      throw new NotFoundException({
        code: "EXAM_PERIOD_NOT_FOUND",
        message: "Exam period was not found",
      });
    const updated = await this.database.client.examPeriod.update({
      where: { id: period.id },
      data: { confirmed },
    });
    return { id: updated.id, confirmed: updated.confirmed };
  }

  async planningMode(userId: string, date = dateString(new Date())) {
    dateOnly(date);
    const periods = await this.database.client.examPeriod.findMany({
      where: { userId },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    return resolvePlanningMode({
      date,
      periods: periods.map((period) => ({
        id: period.id,
        type: period.type,
        startDate: dateString(period.startDate),
        endDate: dateString(period.endDate),
        confirmed: period.confirmed,
      })),
    });
  }

  async submitWeeklyReview(
    userId: string,
    input: {
      weekStart: string;
      difficulty: PlanningDifficulty;
      upcomingChanges: string[];
    },
  ) {
    const requestedStart = dateOnly(input.weekStart);
    if (requestedStart.getUTCDay() !== 1)
      throw new UnprocessableEntityException({
        code: "INVALID_WEEK_START",
        message: "Weekly reviews use Monday week starts",
      });
    if (requestedStart > weekStart(new Date()))
      throw new UnprocessableEntityException({
        code: "WEEK_NOT_REVIEWABLE",
        message: "A future week cannot be reviewed",
      });
    const existingReview = await this.database.client.weeklyReview.findUnique({
      where: {
        userId_weekStart: { userId, weekStart: requestedStart },
      },
      select: { id: true },
    });
    if (existingReview)
      throw new ConflictException({
        code: "REVIEW_EXISTS",
        message: "That week already has a review",
      });
    await this.planner.ensureWeek(userId, input.weekStart);
    const week = await this.database.client.planningWeek.findFirst({
      where: { userId, weekStart: requestedStart, status: "ACTIVE" },
      include: {
        occurrences: { include: { completion: true } },
        weeklyReview: true,
      },
    });
    if (!week)
      throw new NotFoundException({
        code: "PLAN_NOT_FOUND",
        message: "The planning week was not found",
      });
    if (week.weeklyReview)
      throw new ConflictException({
        code: "REVIEW_EXISTS",
        message: "That week already has a review",
      });
    const planned = week.occurrences.filter(
      ({ status }) => status !== "RESCHEDULED",
    );
    if (planned.length === 0)
      throw new UnprocessableEntityException({
        code: "WEEK_NOT_REVIEWABLE",
        message: "A week without planned work cannot be reviewed",
      });
    const completed = planned.filter(({ status }) => status === "COMPLETED");
    const plannedMinutes = planned.reduce(
      (total, occurrence) => total + occurrence.estimatedMinutes,
      0,
    );
    const completedMinutes = completed.reduce(
      (total, occurrence) => total + occurrence.estimatedMinutes,
      0,
    );
    const actualMinutes = completed.reduce(
      (total, occurrence) =>
        total + (occurrence.completion?.actualMinutes ?? 0),
      0,
    );
    const completionRate = ratio(completed.length, planned.length);
    const minuteCompletionRate = ratio(completedMinutes, plannedMinutes);
    const durationRatio =
      actualMinutes <= 0 ? 0 : completedMinutes / actualMinutes;
    const earlyFinish = completed.length > 0 && durationRatio > 1.05;
    const prior = await this.database.client.weeklyReview.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      take: 3,
    });
    const signals = [
      ...prior.reverse().map((review) => ({
        completionRate:
          ((Number(review.completionRate) +
            Number(review.minuteCompletionRate)) /
            2) *
          Math.min(1.15, Math.max(0.8, Number(review.durationRatio) || 1)),
        difficulty: review.difficulty,
        earlyFinish: review.earlyFinish,
      })),
      {
        completionRate:
          ((completionRate + minuteCompletionRate) / 2) *
          Math.min(1.15, Math.max(0.8, durationRatio || 1)),
        difficulty: input.difficulty,
        earlyFinish,
      },
    ];
    const adaptation = calculateAdaptiveLoad(signals);
    const review = await this.database.client.weeklyReview.create({
      data: {
        id: uuidV7(),
        userId,
        planningWeekId: week.id,
        weekStart: requestedStart,
        difficulty: input.difficulty,
        upcomingChanges: jsonValue(input.upcomingChanges),
        plannedTaskCount: planned.length,
        completedTaskCount: completed.length,
        plannedMinutes,
        completedMinutes,
        actualMinutes,
        completionRate,
        minuteCompletionRate,
        durationRatio,
        earlyFinish,
        ewma: adaptation.ewma,
        multiplier: adaptation.multiplier,
        action: adaptation.action,
      },
    });
    const revision = await this.requestRevision(userId, {
      kind: "WEEKLY",
      reason: `Weekly review ${input.weekStart}`,
      utilizationMultiplier: adaptation.multiplier,
    });
    return {
      id: review.id,
      weekStart: input.weekStart,
      metrics: {
        plannedTasks: planned.length,
        completedTasks: completed.length,
        plannedMinutes,
        completedMinutes,
        actualMinutes,
        completionRate,
        minuteCompletionRate,
        durationRatio,
      },
      difficulty: review.difficulty,
      upcomingChanges: input.upcomingChanges,
      adjustment: adaptation,
      revision,
      rulesetVersion: REVISION_RULESET,
    };
  }

  async requestRevision(
    userId: string,
    input: {
      kind: RevisionKind;
      reason: string;
      targetRoleVersionId?: string;
      utilizationMultiplier?: number;
    },
  ) {
    await this.planner.ensureWeek(userId, dateString(weekStart(new Date())));
    const roadmap = await this.database.client.roadmap.findFirst({
      where: { userId, status: "ACTIVE", activeRevisionId: { not: null } },
      include: {
        goal: true,
        activeRevision: {
          include: {
            availability: true,
            terms: {
              include: {
                milestones: {
                  include: {
                    skill: true,
                    learningUnitTemplate: true,
                    sourceRequirement: true,
                    prerequisites: true,
                    tasks: {
                      include: {
                        occurrences: {
                          select: {
                            status: true,
                            completion: { select: { id: true } },
                          },
                        },
                      },
                      orderBy: { sequence: "asc" },
                    },
                  },
                  orderBy: [{ priority: "desc" }, { stableKey: "asc" }],
                },
              },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    if (!roadmap?.activeRevision)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "An active roadmap is required",
      });
    const active = roadmap.activeRevision;
    const open = await this.database.client.roadmapRevision.findFirst({
      where: { roadmapId: roadmap.id, status: { in: ["DRAFT", "READY"] } },
      include: { revisionDiff: true },
    });
    if (open)
      throw new ConflictException({
        code: "REVISION_IN_PROGRESS",
        message: "Decide the existing roadmap revision before creating another",
        revisionId: open.id,
      });
    const issuedVersions = await this.database.client.roadmapRevision.aggregate(
      {
        where: { roadmapId: roadmap.id },
        _max: { version: true },
      },
    );
    const nextRevisionVersion = (issuedVersions._max.version ?? 0) + 1;
    if (
      (input.kind === "ROLE" || input.kind === "CONTENT") &&
      !input.targetRoleVersionId
    )
      throw new UnprocessableEntityException({
        code: "TARGET_ROLE_REQUIRED",
        message: "Role and content revisions require a target role version",
      });
    const targetRoleId =
      input.targetRoleVersionId ?? roadmap.goal.roleVersionId;
    const targetRole = await this.database.client.careerRoleVersion.findUnique({
      where: { id: targetRoleId },
      include: {
        dataset: true,
        requirements: {
          where: { targetLevel: roadmap.goal.targetLevel },
          include: {
            skill: {
              include: {
                learningUnitLinks: { include: { learningUnit: true } },
              },
            },
          },
          orderBy: [{ importance: "desc" }, { skillId: "asc" }],
        },
      },
    });
    if (!targetRole || targetRole.dataset.status !== "PUBLISHED")
      throw new UnprocessableEntityException({
        code: "ROLE_UNAVAILABLE",
        message: "The target role version must be published",
      });
    if (targetRole.requirements.length === 0)
      throw new UnprocessableEntityException({
        code: "ROLE_UNAVAILABLE",
        message: "The target role has no requirements for this level",
      });
    const latestAvailability =
      (await this.database.client.studyAvailability.findFirst({
        where: { userId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      })) ?? active.availability;
    const latestReview = await this.database.client.weeklyReview.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" },
    });
    const utilizationMultiplier = Math.min(
      1.15,
      Math.max(
        0.8,
        input.utilizationMultiplier ?? Number(latestReview?.multiplier ?? 1),
      ),
    );
    const roleSensitive = input.kind === "ROLE" || input.kind === "CONTENT";
    const requirementByKey = new Map(
      targetRole.requirements.map((requirement) => [
        requirement.skill.stableKey,
        requirement,
      ]),
    );
    const termDrafts = active.terms.map((term) => ({
      id: uuidV7(),
      previousId: term.id,
      sequence: term.sequence,
      semesterNumber: term.semesterNumber,
      label: term.label,
      theme: term.theme,
      startDate: term.startDate,
      endDate: term.endDate,
      capacityMinutes: term.capacityMinutes,
    }));
    const termIdByOld = new Map(
      termDrafts.map((term) => [term.previousId, term.id]),
    );
    type TaskDraft = {
      id: string;
      retainedFromTaskId?: string;
      satisfiedByCompletionId?: string;
      skillId: string;
      skillKey: string;
      sequence: number;
      title: string;
      track: "ACADEMIC" | "CAREER" | "PROJECT" | "PLACEMENT";
      estimatedMinutes: number;
      reasonCodes: unknown;
      sourceTrace: unknown;
      state: RevisionTaskInput["state"];
      depth: number;
      targetDate: string;
    };
    type MilestoneDraft = {
      id: string;
      previousId?: string;
      previousTermId?: string;
      termId: string;
      skillId: string;
      skillKey: string;
      learningUnitTemplateId: string;
      sourceRequirementId?: string;
      stableKey: string;
      title: string;
      track: "ACADEMIC" | "CAREER" | "PROJECT" | "PLACEMENT";
      status: "PLANNED" | "LOCKED" | "COMPLETED" | "EXCLUDED";
      estimatedMinutes: number;
      priority: number;
      requiredBy: Date;
      reasonCodes: unknown;
      sourceTrace: unknown;
      prerequisitePreviousIds: string[];
      tasks: TaskDraft[];
    };
    const milestones: MilestoneDraft[] = [];
    const representedSkillKeys = new Set<string>();
    for (const term of active.terms) {
      for (const milestone of term.milestones) {
        const targetRequirement = requirementByKey.get(
          milestone.skill.stableKey,
        );
        const lockedTasks = milestone.tasks.filter(
          (task) =>
            taskState(task.occurrences, task.satisfiedByCompletionId) !==
            "PLANNED",
        );
        if (roleSensitive && !targetRequirement && lockedTasks.length === 0)
          continue;
        if (targetRequirement)
          representedSkillKeys.add(targetRequirement.skill.stableKey);
        const targetSkill = targetRequirement?.skill ?? milestone.skill;
        const learningUnit =
          targetRequirement?.skill.learningUnitLinks
            .map(({ learningUnit }) => learningUnit)
            .filter(
              (unit) =>
                Number(unit.toDepth) >= Number(targetRequirement.requiredDepth),
            )
            .sort(
              (left, right) =>
                left.estimatedMinutes - right.estimatedMinutes ||
                left.stableKey.localeCompare(right.stableKey),
            )[0] ?? milestone.learningUnitTemplate;
        const depth = Number(
          targetRequirement?.requiredDepth ??
            milestone.sourceRequirement?.requiredDepth ??
            learningUnit.toDepth,
        );
        const tasks = milestone.tasks
          .filter(
            (task) =>
              !roleSensitive ||
              Boolean(targetRequirement) ||
              taskState(task.occurrences, task.satisfiedByCompletionId) !==
                "PLANNED",
          )
          .map((task) => ({
            id: uuidV7(),
            retainedFromTaskId: task.id,
            ...(task.satisfiedByCompletionId ||
            task.occurrences.find(({ status }) => status === "COMPLETED")
              ?.completion?.id
              ? {
                  satisfiedByCompletionId:
                    task.satisfiedByCompletionId ??
                    task.occurrences.find(
                      ({ status }) => status === "COMPLETED",
                    )!.completion!.id,
                }
              : {}),
            skillId: targetSkill.id,
            skillKey: targetSkill.stableKey,
            sequence: task.sequence,
            title: task.title,
            track: milestone.track,
            estimatedMinutes: task.estimatedMinutes,
            reasonCodes: task.reasonCodes,
            sourceTrace: task.sourceTrace,
            state: taskState(task.occurrences, task.satisfiedByCompletionId),
            depth,
            targetDate: dateString(milestone.requiredBy),
          }));
        milestones.push({
          id: uuidV7(),
          previousId: milestone.id,
          previousTermId: term.id,
          termId: termIdByOld.get(term.id)!,
          skillId: targetSkill.id,
          skillKey: targetSkill.stableKey,
          learningUnitTemplateId: learningUnit.id,
          ...(targetRequirement
            ? { sourceRequirementId: targetRequirement.id }
            : milestone.sourceRequirementId
              ? { sourceRequirementId: milestone.sourceRequirementId }
              : {}),
          stableKey: milestone.stableKey,
          title: milestone.title,
          track: milestone.track,
          status: lockedTasks.length > 0 ? "LOCKED" : milestone.status,
          estimatedMinutes:
            tasks.length > 0
              ? tasks.reduce((total, task) => total + task.estimatedMinutes, 0)
              : milestone.estimatedMinutes,
          priority: Number(milestone.priority),
          requiredBy: milestone.requiredBy,
          reasonCodes: milestone.reasonCodes,
          sourceTrace: milestone.sourceTrace,
          prerequisitePreviousIds: milestone.prerequisites.map(
            ({ prerequisiteId }) => prerequisiteId,
          ),
          tasks,
        });
      }
    }
    const firstTerm = termDrafts[0];
    if (!firstTerm)
      throw new UnprocessableEntityException({
        code: "INVALID_ACTIVE_ROADMAP",
        message: "The active roadmap has no planning terms",
      });
    for (const requirement of targetRole.requirements) {
      if (representedSkillKeys.has(requirement.skill.stableKey)) continue;
      const learningUnit = requirement.skill.learningUnitLinks
        .map(({ learningUnit }) => learningUnit)
        .filter(
          (unit) => Number(unit.toDepth) >= Number(requirement.requiredDepth),
        )
        .sort(
          (left, right) =>
            left.estimatedMinutes - right.estimatedMinutes ||
            left.stableKey.localeCompare(right.stableKey),
        )[0];
      if (!learningUnit)
        throw new UnprocessableEntityException({
          code: "REVIEWED_CONTENT_MISSING",
          message: `No reviewed learning unit reaches ${requirement.skill.name}`,
        });
      const requiredBy = new Date(
        roadmap.goal.deadline.getTime() -
          requirement.requiredByDaysBeforeDeadline * DAY_MS,
      );
      const parts = splitMinutes(
        learningUnit.estimatedMinutes,
        latestAvailability.maxSessionMinutes,
      );
      const milestoneId = uuidV7();
      milestones.push({
        id: milestoneId,
        termId: firstTerm.id,
        skillId: requirement.skillId,
        skillKey: requirement.skill.stableKey,
        learningUnitTemplateId: learningUnit.id,
        sourceRequirementId: requirement.id,
        stableKey: `revision.${requirement.skill.stableKey}`,
        title: `Build ${requirement.skill.name}`,
        track:
          Number(requirement.placementRelevance) >= 0.8
            ? "PLACEMENT"
            : "CAREER",
        status: "PLANNED",
        estimatedMinutes: learningUnit.estimatedMinutes,
        priority:
          100 * Number(requirement.importance) +
          30 * Number(requirement.placementRelevance),
        requiredBy,
        reasonCodes: ["ROLE_REQUIRED"],
        sourceTrace: {
          targetRoleVersionId: targetRole.id,
          requirementId: requirement.id,
          rulesetVersion: REVISION_RULESET,
        },
        prerequisitePreviousIds: [],
        tasks: parts.map((minutes, index) => ({
          id: uuidV7(),
          skillId: requirement.skillId,
          skillKey: requirement.skill.stableKey,
          sequence: index + 1,
          title:
            parts.length === 1
              ? `Build ${requirement.skill.name}`
              : `Build ${requirement.skill.name} · ${index + 1}/${parts.length}`,
          track:
            Number(requirement.placementRelevance) >= 0.8
              ? "PLACEMENT"
              : "CAREER",
          estimatedMinutes: minutes,
          reasonCodes: ["ROLE_REQUIRED"],
          sourceTrace: {
            targetRoleVersionId: targetRole.id,
            requirementId: requirement.id,
            rulesetVersion: REVISION_RULESET,
            taskPart: index + 1,
            taskParts: parts.length,
          },
          state: "PLANNED",
          depth: Number(requirement.requiredDepth),
          targetDate: dateString(requiredBy),
        })),
      });
    }
    const previousTasks: RevisionTaskInput[] = active.terms.flatMap((term) =>
      term.milestones.flatMap((milestone) => {
        const depth = Number(
          milestone.sourceRequirement?.requiredDepth ??
            milestone.learningUnitTemplate.toDepth,
        );
        return milestone.tasks.map((task) => ({
          id: task.id,
          stableKey: `${milestone.skill.stableKey}:${task.sequence}`,
          canonicalSkillId: milestone.skill.stableKey,
          depth,
          estimatedMinutes: task.estimatedMinutes,
          targetDate: dateString(milestone.requiredBy),
          state: taskState(task.occurrences, task.satisfiedByCompletionId),
        }));
      }),
    );
    const proposedTasks: RevisionTaskInput[] = milestones.flatMap((milestone) =>
      milestone.tasks.map((task) => ({
        id: task.id,
        stableKey: `${task.skillKey}:${task.sequence}`,
        canonicalSkillId: task.skillKey,
        depth: task.depth,
        estimatedMinutes: task.estimatedMinutes,
        targetDate: task.targetDate,
        state: task.state,
      })),
    );
    const calculatedDiff = diffRoadmapTasks(previousTasks, proposedTasks);
    const consent = revisionConsent({
      trigger:
        input.kind === "WEEKLY"
          ? "WEEKLY"
          : input.kind === "ROLE"
            ? "ROLE"
            : input.kind === "CONTENT"
              ? "CONTENT"
              : "MATERIAL",
      hoursMovedPercent: calculatedDiff.hoursMovedPercent,
      milestoneDateChanges: calculatedDiff.milestoneDateChanges,
    });
    const priorById = new Map(previousTasks.map((task) => [task.id, task]));
    const proposedById = new Map(proposedTasks.map((task) => [task.id, task]));
    const explainTask = (task: RevisionTaskInput | undefined) =>
      task
        ? {
            id: task.id,
            skillKey: task.canonicalSkillId,
            minutes: task.estimatedMinutes,
            depth: task.depth,
            targetDate: task.targetDate,
            state: task.state,
          }
        : null;
    const retained = calculatedDiff.retained.map((item) => ({
      previous: explainTask(priorById.get(item.previousId)),
      proposed: explainTask(proposedById.get(item.proposedId)),
      locked: item.locked,
    }));
    const changed = calculatedDiff.changed.map((item) => ({
      previous: explainTask(priorById.get(item.previousId)),
      proposed: explainTask(proposedById.get(item.proposedId)),
      depthDelta: item.depthDelta,
      minutesDelta: item.minutesDelta,
      targetDateChanged: item.targetDateChanged,
    }));
    const newTasks = calculatedDiff.new.map(explainTask);
    const noLongerRequired = calculatedDiff.noLongerRequired.map(explainTask);
    const revisionId = uuidV7();
    const revisionInput = {
      baseRevisionId: active.id,
      baseVersion: active.version,
      kind: input.kind,
      reason: input.reason,
      targetRoleVersionId: targetRole.id,
      targetRoleKey: targetRole.stableKey,
      targetCareerDatasetId: targetRole.datasetId,
      targetCareerDatasetVersion: targetRole.dataset.datasetVersion,
      availabilityId: latestAvailability.id,
      utilizationMultiplier,
      examPeriods: await this.listExamPeriods(userId),
      rulesetVersion: REVISION_RULESET,
    };
    const inputHash = hash(revisionInput);
    const totalProposedMinutes = milestones.reduce(
      (total, milestone) => total + milestone.estimatedMinutes,
      0,
    );
    const summary = {
      previousVersion: active.version,
      proposedVersion: nextRevisionVersion,
      previousMinutes: active.terms.reduce(
        (total, term) => total + term.plannedMinutes,
        0,
      ),
      proposedMinutes: totalProposedMinutes,
      hoursMovedPercent: calculatedDiff.hoursMovedPercent,
      milestoneDateChanges: calculatedDiff.milestoneDateChanges,
      utilizationMultiplier,
      reason: input.reason,
    };
    await this.database.client.$transaction(async (transaction) => {
      await transaction.roadmapRevision.create({
        data: {
          id: revisionId,
          roadmapId: roadmap.id,
          version: nextRevisionVersion,
          status: "READY",
          trigger: input.kind,
          gapAnalysisId:
            targetRole.datasetId === active.careerDatasetId
              ? active.gapAnalysisId
              : null,
          availabilityId: latestAvailability.id,
          curriculumProgramId: active.curriculumProgramId,
          careerDatasetId: targetRole.datasetId,
          supersedesId: active.id,
          rulesetVersion: REVISION_RULESET,
          seed: inputHash.slice(0, 64),
          inputHash,
          inputSnapshot: jsonValue(revisionInput),
          summary: jsonValue(summary),
          exclusions: jsonValue(noLongerRequired),
          risks: jsonValue(
            calculatedDiff.hoursMovedPercent > 10
              ? [{ code: "MATERIAL_CHANGE" }]
              : [],
          ),
          generatedAt: new Date(),
        },
      });
      for (const term of termDrafts) {
        const plannedMinutes = milestones
          .filter(({ termId }) => termId === term.id)
          .reduce((total, milestone) => total + milestone.estimatedMinutes, 0);
        await transaction.roadmapTerm.create({
          data: {
            id: term.id,
            revisionId,
            sequence: term.sequence,
            semesterNumber: term.semesterNumber,
            label: term.label,
            theme: term.theme,
            startDate: term.startDate,
            endDate: term.endDate,
            capacityMinutes: term.capacityMinutes,
            plannedMinutes,
          },
        });
      }
      for (const milestone of milestones) {
        await transaction.roadmapMilestone.create({
          data: {
            id: milestone.id,
            termId: milestone.termId,
            skillId: milestone.skillId,
            learningUnitTemplateId: milestone.learningUnitTemplateId,
            sourceRequirementId: milestone.sourceRequirementId ?? null,
            stableKey: milestone.stableKey,
            title: milestone.title,
            track: milestone.track,
            status: milestone.status,
            estimatedMinutes: milestone.estimatedMinutes,
            priority: milestone.priority,
            requiredBy: milestone.requiredBy,
            reasonCodes: jsonValue(milestone.reasonCodes),
            sourceTrace: jsonValue({
              ...recordValue(milestone.sourceTrace),
              baseRevisionId: active.id,
              roadmapRevisionId: revisionId,
              rulesetVersion: REVISION_RULESET,
            }),
          },
        });
        for (const task of milestone.tasks)
          await transaction.roadmapTask.create({
            data: {
              id: task.id,
              userId,
              revisionId,
              milestoneId: milestone.id,
              skillId: task.skillId,
              sequence: task.sequence,
              title: task.title,
              track: task.track,
              estimatedMinutes: task.estimatedMinutes,
              reasonCodes: jsonValue(task.reasonCodes),
              sourceTrace: jsonValue({
                ...recordValue(task.sourceTrace),
                baseRevisionId: active.id,
                roadmapRevisionId: revisionId,
                retainedFromTaskId: task.retainedFromTaskId ?? null,
                rulesetVersion: REVISION_RULESET,
              }),
              retainedFromTaskId: task.retainedFromTaskId ?? null,
              satisfiedByCompletionId: task.satisfiedByCompletionId ?? null,
            },
          });
      }
      const milestoneIdByOld = new Map(
        milestones
          .filter(
            (milestone): milestone is MilestoneDraft & { previousId: string } =>
              Boolean(milestone.previousId),
          )
          .map((milestone) => [milestone.previousId, milestone.id]),
      );
      for (const milestone of milestones)
        for (const priorId of milestone.prerequisitePreviousIds) {
          const prerequisiteId = milestoneIdByOld.get(priorId);
          if (prerequisiteId)
            await transaction.roadmapMilestoneDependency.create({
              data: { milestoneId: milestone.id, prerequisiteId },
            });
        }
      await transaction.roadmapRevisionDiff.create({
        data: {
          id: uuidV7(),
          userId,
          revisionId,
          kind: input.kind,
          inputHash,
          consentRequired: consent.required,
          autoEligible: consent.autoEligible,
          hoursMovedPercent: calculatedDiff.hoursMovedPercent,
          milestoneDateChanges: calculatedDiff.milestoneDateChanges,
          retained: jsonValue(retained),
          changed: jsonValue(changed),
          newTasks: jsonValue(newTasks),
          noLongerRequired: jsonValue(noLongerRequired),
          summary: jsonValue(summary),
          expiresAt: new Date(Date.now() + 30 * DAY_MS),
        },
      });
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "RoadmapRevision",
          aggregateId: revisionId,
          eventType: "roadmap.revision-previewed.v1",
          payload: { roadmapId: roadmap.id, revisionId, kind: input.kind },
        },
      });
    });
    if (consent.autoEligible)
      return this.activateRevision(userId, revisionId, active.version, false);
    return this.revisionDiff(userId, revisionId);
  }

  async revisionDiff(userId: string, revisionId: string) {
    const revision = await this.database.client.roadmapRevision.findFirst({
      where: { id: revisionId, roadmap: { userId } },
      include: { revisionDiff: true },
    });
    if (!revision?.revisionDiff)
      throw new NotFoundException({
        code: "REVISION_NOT_FOUND",
        message: "Roadmap revision preview was not found",
      });
    const diff = revision.revisionDiff;
    return {
      id: revision.id,
      version: revision.version,
      status: revision.status,
      kind: diff.kind,
      consentRequired: diff.consentRequired,
      autoEligible: diff.autoEligible,
      hoursMovedPercent: Number(diff.hoursMovedPercent),
      milestoneDateChanges: diff.milestoneDateChanges,
      retained: diff.retained,
      changed: diff.changed,
      new: diff.newTasks,
      noLongerRequired: diff.noLongerRequired,
      summary: diff.summary,
      expiresAt: diff.expiresAt,
      acceptedAt: diff.acceptedAt,
      rejectedAt: diff.rejectedAt,
      rulesetVersion: revision.rulesetVersion,
    };
  }

  async activateRevision(
    userId: string,
    revisionId: string,
    expectedActiveVersion: number,
    explicitConsent = true,
  ) {
    const revision = await this.database.client.roadmapRevision.findFirst({
      where: { id: revisionId, roadmap: { userId } },
      include: {
        revisionDiff: true,
        roadmap: { include: { activeRevision: true, goal: true } },
        roadmapTasks: {
          where: { retainedFromTaskId: { not: null } },
          include: {
            skill: true,
            retainedFrom: { include: { skill: true } },
          },
        },
      },
    });
    if (!revision?.revisionDiff || !revision.roadmap.activeRevision)
      throw new NotFoundException({
        code: "REVISION_NOT_FOUND",
        message: "Roadmap revision preview was not found",
      });
    const active = revision.roadmap.activeRevision;
    if (active.version !== expectedActiveVersion)
      throw new ConflictException({
        code: "ACTIVE_VERSION_CHANGED",
        message: "The active roadmap changed; regenerate the preview",
      });
    if (revision.status !== "READY" || revision.revisionDiff.rejectedAt)
      throw new ConflictException({
        code: "INVALID_REVISION",
        message: "Roadmap revision is not ready for activation",
      });
    if (revision.revisionDiff.expiresAt <= new Date())
      throw new ConflictException({
        code: "REVISION_EXPIRED",
        message: "The roadmap preview expired after 30 days",
      });
    if (revision.revisionDiff.consentRequired && !explicitConsent)
      throw new UnprocessableEntityException({
        code: "EXPLICIT_CONSENT_REQUIRED",
        message: "This material revision requires explicit acceptance",
      });
    const activeWork = await this.database.client.taskOccurrence.count({
      where: {
        userId,
        task: { revisionId: active.id },
        status: { in: ["IN_PROGRESS", "PARTIAL"] },
      },
    });
    if (activeWork > 0)
      throw new ConflictException({
        code: "ACTIVE_WORK_LOCKED",
        message:
          "Finish or close in-progress work before activating a revision",
      });
    const snapshot = recordValue(revision.inputSnapshot);
    const targetRoleVersionId =
      typeof snapshot.targetRoleVersionId === "string"
        ? snapshot.targetRoleVersionId
        : revision.roadmap.goal.roleVersionId;
    const targetRole = await this.database.client.careerRoleVersion.findUnique({
      where: { id: targetRoleVersionId },
    });
    if (!targetRole)
      throw new UnprocessableEntityException({
        code: "ROLE_UNAVAILABLE",
        message: "The preview target role is no longer available",
      });
    const transferPairs = revision.roadmapTasks.filter(
      (task) =>
        task.retainedFrom &&
        task.retainedFrom.skill.stableKey === task.skill.stableKey &&
        task.retainedFrom.skillId !== task.skillId,
    );
    const transferSkillPairs = [
      ...new Map(
        transferPairs.map((task) => [
          `${task.retainedFrom!.skillId}:${task.skillId}`,
          { oldSkillId: task.retainedFrom!.skillId, newSkillId: task.skillId },
        ]),
      ).values(),
    ];
    const transferEvidence = await Promise.all(
      transferSkillPairs.map(async (pair) => ({
        ...pair,
        estimate: await this.database.client.studentSkill.findUnique({
          where: { userId_skillId: { userId, skillId: pair.oldSkillId } },
        }),
        evidence: await this.database.client.skillEvidence.findMany({
          where: { userId, skillId: pair.oldSkillId },
        }),
      })),
    );
    const activatedAt = new Date();
    await this.database.client.$transaction(async (transaction) => {
      await transaction.roadmapRevision.update({
        where: { id: active.id },
        data: { status: "SUPERSEDED" },
      });
      await transaction.planningWeek.updateMany({
        where: { revisionId: active.id, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      await transaction.roadmapRevision.update({
        where: { id: revision.id },
        data: { status: "ACTIVE", activatedAt },
      });
      await transaction.roadmap.update({
        where: { id: revision.roadmapId },
        data: { activeRevisionId: revision.id },
      });
      await transaction.roadmapRevisionDiff.update({
        where: { revisionId: revision.id },
        data: { acceptedAt: activatedAt },
      });
      if (revision.roadmap.goal.roleVersionId !== targetRoleVersionId) {
        const nextVersion = revision.roadmap.goal.lockVersion + 1;
        await transaction.careerGoal.update({
          where: { id: revision.roadmap.goal.id },
          data: {
            roleVersionId: targetRoleVersionId,
            datasetId: targetRole.datasetId,
            lockVersion: nextVersion,
          },
        });
        await transaction.careerGoalVersion.create({
          data: {
            id: uuidV7(),
            goalId: revision.roadmap.goal.id,
            version: nextVersion,
            roleVersionId: targetRoleVersionId,
            targetLevel: revision.roadmap.goal.targetLevel,
            deadline: revision.roadmap.goal.deadline,
            deadlineBasis: revision.roadmap.goal.deadlineBasis,
          },
        });
      }
      for (const transfer of transferEvidence) {
        for (const evidence of transfer.evidence)
          await transaction.skillEvidence.upsert({
            where: {
              sourceType_sourceId_skillId: {
                sourceType: evidence.sourceType,
                sourceId: evidence.sourceId,
                skillId: transfer.newSkillId,
              },
            },
            create: {
              id: uuidV7(),
              userId,
              skillId: transfer.newSkillId,
              sourceType: evidence.sourceType,
              sourceId: evidence.sourceId,
              proficiency: evidence.proficiency,
              confidence: evidence.confidence,
              occurredAt: evidence.occurredAt,
              expiresAt: evidence.expiresAt,
              metadata: jsonValue({
                ...recordValue(evidence.metadata),
                transferredFromSkillId: transfer.oldSkillId,
                contentRevisionId: revision.id,
              }),
            },
            update: {},
          });
        if (transfer.estimate)
          await transaction.studentSkill.upsert({
            where: {
              userId_skillId: { userId, skillId: transfer.newSkillId },
            },
            create: {
              id: uuidV7(),
              userId,
              skillId: transfer.newSkillId,
              proficiency: transfer.estimate.proficiency,
              confidence: transfer.estimate.confidence,
              effectiveProficiency: transfer.estimate.effectiveProficiency,
              algorithmVersion: transfer.estimate.algorithmVersion,
              lastEvidencedAt: transfer.estimate.lastEvidencedAt,
            },
            update: {},
          });
      }
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "RoadmapRevision",
          aggregateId: revision.id,
          eventType: "roadmap.revision-activated.v1",
          payload: {
            roadmapId: revision.roadmapId,
            previousRevisionId: active.id,
            revisionId: revision.id,
            version: revision.version,
            explicitConsent,
          },
        },
      });
    });
    return {
      id: revision.id,
      version: revision.version,
      status: "ACTIVE" as const,
      activatedAt,
      previousRevisionId: active.id,
      autoActivated: !explicitConsent,
    };
  }

  async rejectRevision(userId: string, revisionId: string) {
    const revision = await this.database.client.roadmapRevision.findFirst({
      where: { id: revisionId, roadmap: { userId }, status: "READY" },
      include: { revisionDiff: true },
    });
    if (!revision?.revisionDiff)
      throw new NotFoundException({
        code: "REVISION_NOT_FOUND",
        message: "Roadmap revision preview was not found",
      });
    const rejectedAt = new Date();
    await this.database.client.$transaction([
      this.database.client.roadmapRevision.update({
        where: { id: revision.id },
        data: { status: "FAILED" },
      }),
      this.database.client.roadmapRevisionDiff.update({
        where: { revisionId: revision.id },
        data: { rejectedAt },
      }),
    ]);
    return { id: revision.id, status: "REJECTED" as const, rejectedAt };
  }
}
