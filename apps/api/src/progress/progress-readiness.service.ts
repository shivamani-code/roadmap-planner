import { createHash } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { calculateProgress, calculateReadiness } from "@studentos/planning";
import { uuidV7 } from "@studentos/domain";
import { Prisma } from "@studentos/database";
import { DatabaseService } from "../config/database.service.js";

const DAY_MS = 86_400_000;
const READINESS_RULESET = "readiness-1.0.0";
const PROGRESS_RULESET = "progress-1.0.0";

function jsonValue(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function readinessResponse(metric: {
  id: string;
  score: unknown;
  uncappedScore: unknown;
  scoreCap: number;
  dimensions: unknown;
  gates: unknown;
  projection: unknown;
  rulesetVersion: string;
  calculatedAt: Date;
}) {
  return {
    id: metric.id,
    label: "Preparation readiness—not hiring probability",
    score: Number(metric.score),
    uncappedScore: Number(metric.uncappedScore),
    cap: metric.scoreCap,
    dimensions: metric.dimensions,
    gates: metric.gates,
    projection: metric.projection,
    rulesetVersion: metric.rulesetVersion,
    calculatedAt: metric.calculatedAt,
  };
}

@Injectable()
export class ProgressReadinessService {
  constructor(private readonly database: DatabaseService) {}

  async placementProfile(userId: string) {
    const profile = await this.database.client.placementProfile.findUnique({
      where: { userId },
    });
    return {
      resumeComplete: profile?.resumeComplete ?? false,
      profileComplete: profile?.profileComplete ?? false,
      updatedAt: profile?.updatedAt ?? null,
    };
  }

  async updatePlacementProfile(
    userId: string,
    input: { resumeComplete: boolean; profileComplete: boolean },
  ) {
    const profile = await this.database.client.placementProfile.upsert({
      where: { userId },
      create: { id: uuidV7(), userId, ...input },
      update: input,
    });
    return {
      resumeComplete: profile.resumeComplete,
      profileComplete: profile.profileComplete,
      updatedAt: profile.updatedAt,
    };
  }

  async readiness(userId: string) {
    const goal = await this.database.client.careerGoal.findFirst({
      where: { userId, status: "ACTIVE" },
      include: {
        roleVersion: {
          include: {
            requirements: {
              include: { skill: true },
            },
          },
        },
      },
    });
    if (!goal)
      throw new NotFoundException({
        code: "NO_GOAL",
        message: "An active career goal is required",
      });
    const requirements = goal.roleVersion.requirements.filter(
      ({ targetLevel }) => targetLevel === goal.targetLevel,
    );
    const skillIds = requirements.map(({ skillId }) => skillId);
    const [
      estimates,
      reviewedProject,
      placementProfile,
      timedEvidence,
      interviewEvidence,
      availability,
      tasks,
      completions,
    ] = await Promise.all([
      this.database.client.studentSkill.findMany({
        where: { userId, skillId: { in: skillIds } },
      }),
      this.database.client.projectMilestoneProgress.count({
        where: {
          status: "COMPLETED",
          studentProject: {
            userId,
            template: {
              roleFits: { some: { roleVersionId: goal.roleVersionId } },
            },
          },
        },
      }),
      this.database.client.placementProfile.findUnique({ where: { userId } }),
      this.database.client.skillEvidence.count({
        where: { userId, sourceType: "DIAGNOSTIC" },
      }),
      this.database.client.skillEvidence.count({
        where: { userId, sourceType: "MOCK_INTERVIEW" },
      }),
      this.database.client.studyAvailability.findFirst({
        where: { userId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      }),
      this.database.client.roadmapTask.findMany({
        where: { userId, revision: { activeForRoadmap: { is: { userId } } } },
        include: { occurrences: { select: { status: true } } },
      }),
      this.database.client.taskCompletion.findMany({
        where: {
          userId,
          completedAt: { gte: new Date(Date.now() - 28 * DAY_MS) },
        },
        orderBy: { completedAt: "asc" },
      }),
    ]);
    const estimateBySkill = new Map(
      estimates.map((estimate) => [estimate.skillId, estimate]),
    );
    const result = calculateReadiness(
      requirements.map((requirement) => {
        const estimate = estimateBySkill.get(requirement.skillId);
        return {
          id: requirement.skill.name,
          dimension: requirement.skill.category,
          requiredDepth: Number(requirement.requiredDepth),
          importance: Number(requirement.importance),
          proficiency:
            estimate?.proficiency === null ||
            estimate?.proficiency === undefined
              ? null
              : Number(estimate.proficiency),
          confidence: Number(estimate?.confidence ?? 0),
        };
      }),
      {
        reviewedProject: reviewedProject > 0,
        profileComplete: Boolean(
          placementProfile?.resumeComplete && placementProfile.profileComplete,
        ),
        timedAssessment: timedEvidence > 0,
        interviewEvidence: interviewEvidence > 0,
      },
    );
    const completedTaskIds = new Set(
      tasks
        .filter(({ occurrences }) =>
          occurrences.some(({ status }) => status === "COMPLETED"),
        )
        .map(({ id }) => id),
    );
    const remainingMinutes = tasks
      .filter(({ id }) => !completedTaskIds.has(id))
      .reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const minutesByWeek = new Map<string, number>();
    for (const completion of completions) {
      const date = new Date(completion.completedAt);
      const offset = (date.getUTCDay() + 6) % 7;
      const week = new Date(date.getTime() - offset * DAY_MS)
        .toISOString()
        .slice(0, 10);
      minutesByWeek.set(
        week,
        (minutesByWeek.get(week) ?? 0) + completion.actualMinutes,
      );
    }
    const observedWeeks = [...minutesByWeek.values()].filter(
      (minutes) => minutes > 0,
    );
    const projectionMinutes =
      observedWeeks.length >= 2
        ? median(observedWeeks)
        : Math.floor((availability?.weeklyMinutes ?? 0) * 0.85);
    const projection = {
      remainingMinutes,
      weeklyMinutes: projectionMinutes,
      weeksRemaining:
        projectionMinutes <= 0
          ? null
          : Math.ceil(remainingMinutes / projectionMinutes),
      confidence: observedWeeks.length >= 2 ? "OBSERVED" : "LOW",
      basis:
        observedWeeks.length >= 2
          ? "FOUR_WEEK_MEDIAN_COMPLETION"
          : "DECLARED_AVAILABILITY",
    };
    const inputHash = hash({
      goalId: goal.id,
      goalVersion: goal.lockVersion,
      requirements: requirements.map(({ id }) => id),
      estimates: estimates.map(({ skillId, updatedAt }) => [
        skillId,
        updatedAt.toISOString(),
      ]),
      reviewedProject,
      placementProfile: placementProfile?.updatedAt.toISOString() ?? null,
      timedEvidence,
      interviewEvidence,
      projection,
      ruleset: READINESS_RULESET,
    });
    const existing = await this.database.client.placementMetric.findUnique({
      where: { userId_inputHash: { userId, inputHash } },
    });
    if (existing) return readinessResponse(existing);
    const metric = await this.database.client.placementMetric.create({
      data: {
        id: uuidV7(),
        userId,
        goalId: goal.id,
        roleVersionId: goal.roleVersionId,
        rulesetVersion: READINESS_RULESET,
        inputHash,
        score: result.score,
        uncappedScore: result.uncappedScore,
        scoreCap: result.cap,
        dimensions: result.dimensions,
        gates: result.gates,
        projection,
      },
    });
    return readinessResponse(metric);
  }

  async progress(userId: string, requestedDays = 28) {
    if (![7, 28, 90].includes(requestedDays))
      throw new BadRequestException({
        code: "INVALID_RANGE",
        message: "Progress range must be 7, 28, or 90 days",
      });
    const roadmap = await this.database.client.roadmap.findFirst({
      where: { userId, activeRevisionId: { not: null } },
      include: { activeRevision: true },
    });
    if (!roadmap?.activeRevision)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "An active roadmap is required",
      });
    const today = new Date();
    const periodStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - (requestedDays - 1),
      ),
    );
    const periodEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + 1,
      ),
    );
    const [tasks, planningDays, projects, skills] = await Promise.all([
      this.database.client.roadmapTask.findMany({
        where: { userId, revisionId: roadmap.activeRevision.id },
        include: {
          occurrences: { include: { completion: true } },
          retainedFrom: {
            include: { occurrences: { include: { completion: true } } },
          },
        },
      }),
      this.database.client.planningDay.findMany({
        where: {
          localDate: { gte: periodStart, lt: periodEnd },
          week: { userId },
        },
        include: {
          week: true,
          occurrences: { include: { completion: true, task: true } },
        },
      }),
      this.database.client.studentProject.findMany({
        where: { userId },
        include: {
          template: { include: { milestones: true } },
          milestones: true,
        },
      }),
      this.database.client.studentSkill.findMany({
        where: { userId },
        include: { skill: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const completedRoadmapTasks = tasks.filter(
      ({ occurrences, satisfiedByCompletionId }) =>
        Boolean(satisfiedByCompletionId) ||
        occurrences.some(({ status }) => status === "COMPLETED"),
    );
    const completedRoadmapTaskIds = new Set([
      ...completedRoadmapTasks.map(({ id }) => id),
      ...tasks
        .filter(({ retainedFrom }) =>
          retainedFrom?.occurrences.some(
            ({ status }) => status === "COMPLETED",
          ),
        )
        .map(({ id }) => id),
    ]);
    const occurrences = planningDays.flatMap((day) =>
      day.occurrences.filter(
        (occurrence) =>
          day.week.status === "ACTIVE" || occurrence.status === "COMPLETED",
      ),
    );
    const completedOccurrences = occurrences.filter(
      ({ status }) => status === "COMPLETED",
    );
    const plannedMinutes = occurrences.reduce(
      (sum, occurrence) => sum + occurrence.task.estimatedMinutes,
      0,
    );
    const completedActualMinutes = completedOccurrences.reduce(
      (sum, occurrence) => sum + (occurrence.completion?.actualMinutes ?? 0),
      0,
    );
    const totalRoadmapMinutes = tasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    );
    const completedRoadmapMinutes = tasks
      .filter(({ id }) => completedRoadmapTaskIds.has(id))
      .reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const eligibleDays = new Set(
      planningDays
        .filter((day) =>
          day.occurrences.some(
            (occurrence) =>
              day.week.status === "ACTIVE" || occurrence.status === "COMPLETED",
          ),
        )
        .map(({ localDate }) => localDate.toISOString().slice(0, 10)),
    ).size;
    const activeDays = new Set(
      planningDays
        .filter(({ occurrences }) =>
          occurrences.some(({ status }) => status === "COMPLETED"),
        )
        .map(({ localDate }) => localDate.toISOString().slice(0, 10)),
    ).size;
    const metrics = calculateProgress({
      plannedTasks: occurrences.length,
      completedTasks: completedOccurrences.length,
      plannedMinutes,
      completedMinutes: completedActualMinutes,
      totalRoadmapMinutes,
      completedRoadmapMinutes,
      eligibleDays,
      activeDays,
    });
    const snapshotMetrics = {
      ...metrics,
      plannedTasks: occurrences.length,
      completedTasks: completedOccurrences.length,
      plannedMinutes,
      completedActualMinutes,
      eligibleDays,
      activeDays,
    };
    const snapshot = await this.database.client.progressSnapshot.upsert({
      where: {
        userId_periodType_periodStart_roadmapRevisionId: {
          userId,
          periodType: `ROLLING_${requestedDays}D`,
          periodStart,
          roadmapRevisionId: roadmap.activeRevision.id,
        },
      },
      create: {
        id: uuidV7(),
        userId,
        roadmapRevisionId: roadmap.activeRevision.id,
        periodType: `ROLLING_${requestedDays}D`,
        periodStart,
        metrics: jsonValue(snapshotMetrics),
        algorithmVersion: PROGRESS_RULESET,
      },
      update: {},
    });
    return {
      roadmapRevisionId: roadmap.activeRevision.id,
      range: {
        days: requestedDays,
        start: periodStart.toISOString().slice(0, 10),
        end: new Date(periodEnd.getTime() - DAY_MS).toISOString().slice(0, 10),
      },
      snapshot: {
        id: snapshot.id,
        algorithmVersion: snapshot.algorithmVersion,
        capturedAt: snapshot.createdAt,
      },
      metrics,
      totals: {
        plannedTasks: occurrences.length,
        completedTasks: completedOccurrences.length,
        plannedMinutes,
        completedActualMinutes,
        eligibleDays,
        activeDays,
      },
      projects: projects.map((project) => ({
        id: project.id,
        title: project.template.title,
        status: project.status,
        progressPercent: Math.round(
          project.template.milestones.reduce(
            (sum, milestone) =>
              sum +
              (project.milestones.some(
                (item) =>
                  item.milestoneId === milestone.id &&
                  item.status === "COMPLETED",
              )
                ? Number(milestone.weight)
                : 0),
            0,
          ) * 100,
        ),
      })),
      skills: skills.map((estimate) => ({
        id: estimate.skillId,
        key: estimate.skill.stableKey,
        name: estimate.skill.name,
        category: estimate.skill.category,
        proficiency:
          estimate.proficiency === null ? null : Number(estimate.proficiency),
        confidence: Number(estimate.confidence),
        effectiveProficiency:
          estimate.effectiveProficiency === null
            ? null
            : Number(estimate.effectiveProficiency),
        lastEvidencedAt: estimate.lastEvidencedAt,
      })),
    };
  }

  async skills(userId: string) {
    const skills = await this.database.client.studentSkill.findMany({
      where: { userId },
      include: {
        skill: true,
      },
      orderBy: [
        { skill: { category: "asc" } },
        { skill: { stableKey: "asc" } },
      ],
    });
    return skills.map((item) => ({
      id: item.skillId,
      key: item.skill.stableKey,
      name: item.skill.name,
      category: item.skill.category,
      proficiency: item.proficiency === null ? null : Number(item.proficiency),
      confidence: Number(item.confidence),
      effectiveProficiency:
        item.effectiveProficiency === null
          ? null
          : Number(item.effectiveProficiency),
      algorithmVersion: item.algorithmVersion,
      lastEvidencedAt: item.lastEvidencedAt,
    }));
  }

  async skill(userId: string, skillId: string) {
    const estimate = await this.database.client.studentSkill.findFirst({
      where: { userId, skillId },
      include: { skill: true },
    });
    if (!estimate)
      throw new NotFoundException({
        code: "SKILL_NOT_FOUND",
        message: "Student skill was not found",
      });
    const [evidence, profile] = await Promise.all([
      this.database.client.skillEvidence.findMany({
        where: { userId, skillId },
        orderBy: { occurredAt: "desc" },
      }),
      this.database.client.studentProfile.findUnique({ where: { userId } }),
    ]);
    const curriculum = profile?.curriculumProgramId
      ? await this.database.client.curriculumSkillMapping.findMany({
          where: {
            skillId,
            curriculumTopic: { programId: profile.curriculumProgramId },
          },
          include: {
            curriculumTopic: {
              include: {
                unit: {
                  include: { subject: { include: { semester: true } } },
                },
              },
            },
          },
          orderBy: [{ confidence: "desc" }, { depth: "desc" }],
        })
      : [];
    return {
      id: estimate.skillId,
      key: estimate.skill.stableKey,
      name: estimate.skill.name,
      category: estimate.skill.category,
      proficiency:
        estimate.proficiency === null ? null : Number(estimate.proficiency),
      confidence: Number(estimate.confidence),
      effectiveProficiency:
        estimate.effectiveProficiency === null
          ? null
          : Number(estimate.effectiveProficiency),
      mappedCurriculum: curriculum.map((mapping) => ({
        topicId: mapping.curriculumTopicId,
        key: mapping.curriculumTopic.stableKey,
        topic: mapping.curriculumTopic.title,
        subjectCode: mapping.curriculumTopic.unit.subject.code,
        subject: mapping.curriculumTopic.unit.subject.title,
        semester: mapping.curriculumTopic.unit.subject.semester.number,
        depth: Number(mapping.depth),
        confidence: Number(mapping.confidence),
        rationale: mapping.rationale,
      })),
      evidence: evidence.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        proficiency: Number(item.proficiency),
        confidence: Number(item.confidence),
        occurredAt: item.occurredAt,
        expiresAt: item.expiresAt,
        metadata: item.metadata,
      })),
    };
  }
}
