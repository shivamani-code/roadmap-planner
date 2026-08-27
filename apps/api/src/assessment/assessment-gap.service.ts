import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  analyzeGap,
  aggregateEvidence,
  type GapRequirementInput,
} from "@studentos/planning";
import { uuidV7 } from "@studentos/domain";
import { DatabaseService } from "../config/database.service.js";

const ASSESSMENT_LEVELS = {
  UNKNOWN: null,
  NOT_STARTED: 0,
  AWARE: 0.2,
  BASIC: 0.4,
  APPLIED: 0.6,
  PROFICIENT: 0.8,
  READY: 1,
} as const;

export type AssessmentLevel = keyof typeof ASSESSMENT_LEVELS;

export interface DayWindow {
  day: number;
  startMinute: number;
  endMinute: number;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isDayWindow(value: unknown): value is DayWindow {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.day === "number" &&
    typeof candidate.startMinute === "number" &&
    typeof candidate.endMinute === "number"
  );
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateWindows(windows: readonly DayWindow[]): number {
  const sorted = [...windows].sort(
    (left, right) =>
      left.day - right.day || left.startMinute - right.startMinute,
  );
  for (const [index, window] of sorted.entries()) {
    if (
      window.day < 0 ||
      window.day > 6 ||
      window.startMinute < 0 ||
      window.endMinute > 1440 ||
      window.startMinute >= window.endMinute
    ) {
      throw new UnprocessableEntityException({
        code: "INVALID_AVAILABILITY_WINDOW",
        message: "Every availability window must be inside one valid day",
      });
    }
    const prior = sorted[index - 1];
    if (
      prior &&
      prior.day === window.day &&
      prior.endMinute > window.startMinute
    ) {
      throw new UnprocessableEntityException({
        code: "OVERLAPPING_WINDOWS",
        message: "Availability windows cannot overlap",
      });
    }
  }
  return sorted.reduce(
    (total, window) => total + window.endMinute - window.startMinute,
    0,
  );
}

function analysisResponse(analysis: {
  id: string;
  status: string;
  currentContribution: unknown;
  collegeContribution: unknown;
  independentGap: unknown;
  effortP25Hours: unknown;
  effortP50Hours: unknown;
  effortP75Hours: unknown;
  allocatableMinutes: number;
  requiredMinutes: number;
  deficitMinutes: number;
  warnings: unknown;
  goal: {
    targetLevel: string;
    deadline: Date;
    roleVersion: {
      name: string;
      domain: { name: string };
    };
  };
  curriculumProgram: {
    datasetVersion: string;
    branch: { code: string; name: string };
  };
  availability: {
    weeklyMinutes: number;
    maxSessionMinutes: number;
    dayWindows: unknown;
  };
  items: Array<{
    id: string;
    skillId: string;
    classification: string;
    currentProficiency: unknown;
    evidenceConfidence: unknown;
    effectiveProficiency: unknown;
    curriculumDepth: unknown;
    mappingConfidence: unknown;
    effortP50Hours: unknown;
    reasonCodes: unknown;
    trace: unknown;
    skill: { name: string; stableKey: string; category: string };
    requirement: {
      requiredDepth: unknown;
      importance: unknown;
      placementRelevance: unknown;
      required: boolean;
      rationale: string;
    };
  }>;
}) {
  const remaining = analysis.items.filter(
    (item) => !["MASTERED", "DEFERRED"].includes(item.classification),
  );
  const traces = analysis.items
    .map((item) => item.trace)
    .filter(
      (trace): trace is Record<string, unknown> =>
        typeof trace === "object" && trace !== null,
    );
  const subjects = new Map<string, string>();
  for (const trace of traces) {
    const key =
      typeof trace.subjectCode === "string"
        ? trace.subjectCode
        : typeof trace.topicKey === "string"
          ? trace.topicKey
          : null;
    if (key)
      subjects.set(
        key,
        typeof trace.subjectTitle === "string" ? trace.subjectTitle : key,
      );
  }
  const orderedRemaining = [...remaining].sort(
    (left, right) =>
      Number(right.requirement.importance) -
        Number(left.requirement.importance) ||
      Number(right.effortP50Hours) - Number(left.effortP50Hours),
  );
  const itemExplanation = (item: (typeof analysis.items)[number]) => {
    const trace =
      typeof item.trace === "object" && item.trace !== null
        ? (item.trace as Record<string, unknown>)
        : {};
    const subject =
      typeof trace.subjectTitle === "string" ? trace.subjectTitle : null;
    const semester = typeof trace.semester === "number" ? trace.semester : null;
    if (item.classification === "MASTERED")
      return "Your evidence already meets this role requirement. Keep it fresh through applied proof.";
    if (item.classification === "COLLEGE_COVERED")
      return `${subject ?? "Your curriculum"}${semester ? ` in semester ${semester}` : ""} is expected to cover the required depth; add practice so coverage becomes evidence.`;
    if (item.classification === "EXTENSION")
      return `${subject ?? "Your curriculum"} provides a foundation, but the role requires deeper applied ability than the subject alone provides.`;
    if (["CAREER_ONLY", "INDEPENDENT"].includes(item.classification))
      return "No direct reviewed subject mapping covers this role requirement, so it needs an independent learning and project-evidence track.";
    return "Current evidence is too limited to claim proficiency; start with a short diagnostic and then close the measured gap.";
  };
  const nextAction = (item: (typeof analysis.items)[number]) => {
    const trace =
      typeof item.trace === "object" && item.trace !== null
        ? (item.trace as Record<string, unknown>)
        : {};
    const subject =
      typeof trace.subjectTitle === "string" ? trace.subjectTitle : null;
    if (item.classification === "MASTERED")
      return "Attach or refresh portfolio evidence and schedule spaced revision.";
    if (item.classification === "COLLEGE_COVERED")
      return `Use ${subject ?? "the mapped subject"} as the learning base, then complete one applied exercise.`;
    if (item.classification === "EXTENSION")
      return `Review ${subject ?? "the mapped subject"}, then complete an advanced practice unit and role-specific proof.`;
    if (["CAREER_ONLY", "INDEPENDENT"].includes(item.classification))
      return "Complete the independent learning unit, practise it, and produce role-specific evidence.";
    return "Take a focused diagnostic before the first learning unit so the roadmap does not over-plan.";
  };
  const subjectTrackMap = new Map<
    string,
    {
      code: string | null;
      title: string;
      semester: number | null;
      skills: Array<{
        name: string;
        classification: string;
        requiredDepth: number;
        remainingHours: number;
        action: string;
      }>;
    }
  >();
  for (const item of analysis.items) {
    const trace =
      typeof item.trace === "object" && item.trace !== null
        ? (item.trace as Record<string, unknown>)
        : {};
    const code =
      typeof trace.subjectCode === "string" ? trace.subjectCode : null;
    const title =
      typeof trace.subjectTitle === "string"
        ? trace.subjectTitle
        : "Independent career learning";
    const key = code ?? "independent";
    const track = subjectTrackMap.get(key) ?? {
      code,
      title,
      semester: typeof trace.semester === "number" ? trace.semester : null,
      skills: [],
    };
    if (!track.skills.some(({ name }) => name === item.skill.name))
      track.skills.push({
        name: item.skill.name,
        classification: item.classification,
        requiredDepth: Number(item.requirement.requiredDepth),
        remainingHours: Number(item.effortP50Hours),
        action: nextAction(item),
      });
    subjectTrackMap.set(key, track);
  }

  const windows = Array.isArray(analysis.availability.dayWindows)
    ? analysis.availability.dayWindows.filter(isDayWindow)
    : [];
  const weeklyCapacityMinutes = Math.floor(
    analysis.availability.weeklyMinutes * 0.85,
  );
  const planItems =
    orderedRemaining.length > 0 ? orderedRemaining : analysis.items;
  const dailySessions = [...windows]
    .sort(
      (left, right) =>
        left.day - right.day || left.startMinute - right.startMinute,
    )
    .map((window, index) => {
      const item = planItems[index % Math.max(1, planItems.length)];
      return {
        day: window.day,
        dayName: DAY_NAMES[window.day] ?? `Day ${window.day}`,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        plannedMinutes: Math.min(
          window.endMinute - window.startMinute,
          analysis.availability.maxSessionMinutes,
        ),
        focusSkill: item?.skill.name ?? "Review completed role evidence",
        action: item
          ? nextAction(item)
          : "Review role evidence and keep mastered skills current.",
      };
    });
  const weekThemes = [
    [
      "Foundation and diagnostic",
      "Confirm the baseline and learn the highest-priority concepts.",
    ],
    [
      "Guided practice",
      "Turn concepts into repeatable exercises with feedback.",
    ],
    [
      "Role application",
      "Apply the skills to work that resembles the selected job.",
    ],
    [
      "Evidence and review",
      "Package proof, revisit weak areas, and check target depth.",
    ],
  ] as const;
  const weekChunk = Math.max(1, Math.ceil(planItems.length / 4));
  const weeks = weekThemes.map(([theme, outcome], index) => {
    const focus = planItems.slice(index * weekChunk, (index + 1) * weekChunk);
    const selected = focus.length > 0 ? focus : planItems.slice(-1);
    const effortMinutes = selected.reduce(
      (total, item) => total + Number(item.effortP50Hours) * 60,
      0,
    );
    return {
      week: index + 1,
      theme,
      outcome,
      focusSkills: selected.map((item) => item.skill.name),
      plannedMinutes: Math.round(
        Math.min(weeklyCapacityMinutes, effortMinutes),
      ),
    };
  });
  const weeklyHours = Math.max(1, weeklyCapacityMinutes / 60);
  const estimatedMonthCount = Math.max(
    1,
    Math.ceil(Number(analysis.effortP50Hours) / (weeklyHours * 4.33)),
  );
  const visibleMonthCount = Math.min(6, estimatedMonthCount);
  const monthChunk = Math.max(
    1,
    Math.ceil(planItems.length / visibleMonthCount),
  );
  const currentMonth = new Date();
  const months = Array.from({ length: visibleMonthCount }, (_, index) => {
    const date = new Date(
      Date.UTC(
        currentMonth.getUTCFullYear(),
        currentMonth.getUTCMonth() + index,
        1,
      ),
    );
    const focus = planItems.slice(index * monthChunk, (index + 1) * monthChunk);
    return {
      month: index + 1,
      label: new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
      theme:
        index === 0
          ? "Close foundations"
          : index === visibleMonthCount - 1
            ? "Prove role readiness"
            : "Build applied depth",
      focusSkills: (focus.length > 0 ? focus : planItems.slice(-1)).map(
        (item) => item.skill.name,
      ),
      milestone:
        index === visibleMonthCount - 1
          ? "Complete a role-specific proof and reassess the target skills."
          : "Complete learning units and one applied checkpoint for each focus skill.",
    };
  });
  return {
    id: analysis.id,
    status: analysis.status,
    context: {
      branch: analysis.curriculumProgram.branch,
      curriculumVersion: analysis.curriculumProgram.datasetVersion,
      role: {
        name: analysis.goal.roleVersion.name,
        domain: analysis.goal.roleVersion.domain.name,
        targetLevel: analysis.goal.targetLevel,
      },
      deadline: analysis.goal.deadline.toISOString().slice(0, 10),
    },
    contribution: {
      current: Number(analysis.currentContribution),
      college: Number(analysis.collegeContribution),
      independent: Number(analysis.independentGap),
    },
    effortHours: {
      p25: Number(analysis.effortP25Hours),
      p50: Number(analysis.effortP50Hours),
      p75: Number(analysis.effortP75Hours),
    },
    feasibility: {
      allocatableMinutes: analysis.allocatableMinutes,
      requiredMinutes: analysis.requiredMinutes,
      deficitMinutes: analysis.deficitMinutes,
    },
    warnings: analysis.warnings,
    planScope: {
      requiredSkills: analysis.items.length,
      masteredSkills: analysis.items.filter(
        (item) => item.classification === "MASTERED",
      ).length,
      collegeSupportedSkills: analysis.items.filter((item) =>
        ["COLLEGE_COVERED", "EXTENSION"].includes(item.classification),
      ).length,
      independentSkills: analysis.items.filter((item) =>
        ["CAREER_ONLY", "INDEPENDENT", "UNKNOWN"].includes(item.classification),
      ).length,
      remainingSkills: remaining.length,
      supportingSubjects: subjects.size,
      subjectNames: [...subjects.values()].slice(0, 8),
      nextSkills: [...remaining]
        .sort(
          (left, right) =>
            Number(right.effortP50Hours) - Number(left.effortP50Hours),
        )
        .slice(0, 5)
        .map((item) => item.skill.name),
    },
    roadmapPreview: {
      headline: `${orderedRemaining.length} remaining skill${orderedRemaining.length === 1 ? "" : "s"} ordered by role importance`,
      totalHoursP50: Number(analysis.effortP50Hours),
      steps: orderedRemaining.map((item, index) => ({
        order: index + 1,
        skillName: item.skill.name,
        classification: item.classification,
        estimatedHours: Number(item.effortP50Hours),
        action: nextAction(item),
      })),
      subjectTracks: [...subjectTrackMap.values()].sort(
        (left, right) =>
          Number(left.code === null) - Number(right.code === null) ||
          (left.semester ?? 99) - (right.semester ?? 99) ||
          left.title.localeCompare(right.title),
      ),
      schedule: {
        weeklyCapacityMinutes,
        reservePercent: 15,
        maxSessionMinutes: analysis.availability.maxSessionMinutes,
        dailySessions,
        weeks,
        estimatedMonthCount,
        months,
        continuesAfterPreview: estimatedMonthCount > visibleMonthCount,
      },
    },
    items: analysis.items.map((item) => ({
      id: item.id,
      skillId: item.skillId,
      skillKey: item.skill.stableKey,
      skillName: item.skill.name,
      category: item.skill.category,
      classification: item.classification,
      currentProficiency:
        item.currentProficiency === null
          ? null
          : Number(item.currentProficiency),
      evidenceConfidence: Number(item.evidenceConfidence),
      effectiveProficiency:
        item.effectiveProficiency === null
          ? null
          : Number(item.effectiveProficiency),
      curriculumDepth: Number(item.curriculumDepth),
      mappingConfidence: Number(item.mappingConfidence),
      remainingHoursP50: Number(item.effortP50Hours),
      requiredDepth: Number(item.requirement.requiredDepth),
      importance: Number(item.requirement.importance),
      placementRelevance: Number(item.requirement.placementRelevance),
      required: item.requirement.required,
      roleRationale: item.requirement.rationale,
      reasonCodes: item.reasonCodes,
      trace: item.trace,
      explanation: itemExplanation(item),
      nextAction: nextAction(item),
    })),
  };
}

@Injectable()
export class AssessmentGapService {
  constructor(private readonly database: DatabaseService) {}

  async mappingReferences() {
    const [topics, skills, mappings] = await Promise.all([
      this.database.client.curriculumTopic.findMany({
        where: { program: { status: "PUBLISHED" } },
        select: {
          id: true,
          stableKey: true,
          program: { select: { datasetVersion: true } },
        },
        orderBy: { stableKey: "asc" },
      }),
      this.database.client.skill.findMany({
        where: { dataset: { status: "PUBLISHED" } },
        select: {
          id: true,
          stableKey: true,
          dataset: { select: { datasetVersion: true } },
        },
        orderBy: { stableKey: "asc" },
      }),
      this.database.client.curriculumSkillMapping.findMany({
        select: { curriculumTopicId: true, skillId: true, version: true },
      }),
    ]);
    return { topics, skills, mappings };
  }

  async startAssessment(userId: string) {
    const existing = await this.database.client.skillAssessment.findFirst({
      where: { userId, status: "OPEN" },
      include: {
        responses: true,
        goal: {
          include: {
            roleVersion: {
              include: {
                requirements: {
                  where: { required: true },
                  include: { skill: true },
                  orderBy: { importance: "desc" },
                },
              },
            },
          },
        },
      },
    });
    if (existing)
      return {
        id: existing.id,
        schemaVersion: existing.schemaVersion,
        status: existing.status,
        resumed: true,
        responses: Object.fromEntries(
          existing.responses.map((response) => [
            response.skillId,
            response.rawLevel,
          ]),
        ),
        statements: existing.goal.roleVersion.requirements
          .filter(
            (requirement) =>
              requirement.targetLevel === existing.goal.targetLevel,
          )
          .map((requirement) => ({
            skillId: requirement.skillId,
            skillKey: requirement.skill.stableKey,
            skillName: requirement.skill.name,
            category: requirement.skill.category,
            statement: `I can apply ${requirement.skill.name} independently in a role-relevant task.`,
            levels: Object.keys(ASSESSMENT_LEVELS),
          })),
      };
    const goal = await this.database.client.careerGoal.findFirst({
      where: { userId, status: "ACTIVE" },
      include: {
        dataset: true,
        roleVersion: {
          include: {
            requirements: {
              where: { required: true },
              include: { skill: true },
              orderBy: { importance: "desc" },
            },
          },
        },
      },
    });
    if (!goal)
      throw new UnprocessableEntityException({
        code: "GOAL_REQUIRED",
        message: "Select a career goal first",
      });
    const assessment = await this.database.client.skillAssessment.create({
      data: {
        id: uuidV7(),
        userId,
        goalId: goal.id,
        schemaVersion: `${goal.dataset.datasetVersion}.assessment-1`,
      },
    });
    return {
      id: assessment.id,
      schemaVersion: assessment.schemaVersion,
      status: assessment.status,
      resumed: false,
      responses: {},
      statements: goal.roleVersion.requirements
        .filter((requirement) => requirement.targetLevel === goal.targetLevel)
        .map((requirement) => ({
          skillId: requirement.skillId,
          skillKey: requirement.skill.stableKey,
          skillName: requirement.skill.name,
          category: requirement.skill.category,
          statement: `I can apply ${requirement.skill.name} independently in a role-relevant task.`,
          levels: Object.keys(ASSESSMENT_LEVELS),
        })),
    };
  }

  async saveResponses(
    userId: string,
    assessmentId: string,
    responses: readonly { skillId: string; level: AssessmentLevel }[],
  ) {
    const assessment = await this.database.client.skillAssessment.findFirst({
      where: { id: assessmentId, userId },
      include: {
        goal: { include: { roleVersion: { include: { requirements: true } } } },
      },
    });
    if (!assessment)
      throw new NotFoundException({
        code: "ASSESSMENT_NOT_FOUND",
        message: "Assessment was not found",
      });
    if (assessment.status !== "OPEN")
      throw new ConflictException({
        code: "ASSESSMENT_CLOSED",
        message: "Submitted assessments cannot be edited",
      });
    const allowed = new Set(
      assessment.goal.roleVersion.requirements
        .filter(
          ({ targetLevel }) => targetLevel === assessment.goal.targetLevel,
        )
        .map(({ skillId }) => skillId),
    );
    if (
      new Set(responses.map(({ skillId }) => skillId)).size !==
        responses.length ||
      responses.some(({ skillId }) => !allowed.has(skillId))
    ) {
      throw new UnprocessableEntityException({
        code: "INVALID_RESPONSE",
        message: "Each response must reference one role skill exactly once",
      });
    }
    await this.database.client.$transaction(
      responses.map((response) =>
        this.database.client.assessmentResponse.upsert({
          where: {
            assessmentId_skillId: { assessmentId, skillId: response.skillId },
          },
          create: {
            id: uuidV7(),
            assessmentId,
            skillId: response.skillId,
            rawLevel: response.level,
            normalizedValue: ASSESSMENT_LEVELS[response.level],
            confidence: response.level === "UNKNOWN" ? 0 : 0.45,
          },
          update: {
            rawLevel: response.level,
            normalizedValue: ASSESSMENT_LEVELS[response.level],
            confidence: response.level === "UNKNOWN" ? 0 : 0.45,
          },
        }),
      ),
    );
    return { assessmentId, saved: responses.length };
  }

  async submitAssessment(userId: string, assessmentId: string) {
    const assessment = await this.database.client.skillAssessment.findFirst({
      where: { id: assessmentId, userId },
      include: {
        responses: { include: { skill: true } },
        goal: {
          include: {
            roleVersion: {
              include: { requirements: { where: { required: true } } },
            },
          },
        },
      },
    });
    if (!assessment)
      throw new NotFoundException({
        code: "ASSESSMENT_NOT_FOUND",
        message: "Assessment was not found",
      });
    if (assessment.status !== "OPEN")
      throw new ConflictException({
        code: "ASSESSMENT_CLOSED",
        message: "Assessment is already submitted",
      });
    const required = new Set(
      assessment.goal.roleVersion.requirements
        .filter(
          ({ targetLevel }) => targetLevel === assessment.goal.targetLevel,
        )
        .map(({ skillId }) => skillId),
    );
    if (
      [...required].some(
        (skillId) =>
          !assessment.responses.some(
            (response) => response.skillId === skillId,
          ),
      )
    ) {
      throw new UnprocessableEntityException({
        code: "ASSESSMENT_INCOMPLETE",
        message: "Answer every required skill statement, including Unknown",
      });
    }
    const now = new Date();
    await this.database.client.$transaction(async (transaction) => {
      for (const response of assessment.responses) {
        const proficiency =
          response.normalizedValue === null
            ? null
            : Number(response.normalizedValue);
        if (proficiency !== null) {
          await transaction.skillEvidence.create({
            data: {
              id: uuidV7(),
              userId,
              skillId: response.skillId,
              sourceType: "SELF_REPORT",
              sourceId: assessment.id,
              proficiency,
              confidence: 0.45,
              occurredAt: now,
              metadata: { assessmentId: assessment.id },
            },
          });
        }
        const evidence = await transaction.skillEvidence.findMany({
          where: { userId, skillId: response.skillId },
        });
        const estimate = aggregateEvidence(
          evidence.map((item) => ({
            proficiency: Number(item.proficiency),
            confidence: Number(item.confidence),
            occurredAt: item.occurredAt,
            decayDays: response.skill.evidenceDecayDays,
          })),
          now,
        );
        await transaction.studentSkill.upsert({
          where: { userId_skillId: { userId, skillId: response.skillId } },
          create: {
            id: uuidV7(),
            userId,
            skillId: response.skillId,
            proficiency: estimate.proficiency,
            confidence: estimate.confidence,
            effectiveProficiency: estimate.effectiveProficiency,
            algorithmVersion: "evidence-1.0.0",
            ...(evidence.length > 0 ? { lastEvidencedAt: now } : {}),
          },
          update: {
            proficiency: estimate.proficiency,
            confidence: estimate.confidence,
            effectiveProficiency: estimate.effectiveProficiency,
            algorithmVersion: "evidence-1.0.0",
            ...(evidence.length > 0 ? { lastEvidencedAt: now } : {}),
          },
        });
      }
      await transaction.skillAssessment.update({
        where: { id: assessment.id },
        data: { status: "SCORED", submittedAt: now, scoredAt: now },
      });
      await transaction.studentProfile.update({
        where: { userId },
        data: { onboardingStatus: "AVAILABILITY" },
      });
    });
    return {
      assessmentId,
      status: "SCORED" as const,
      skillsScored: assessment.responses.length,
      nextStep: "AVAILABILITY" as const,
    };
  }

  async saveAvailability(
    userId: string,
    input: {
      timezone: string;
      maxSessionMinutes: number;
      windows: readonly DayWindow[];
    },
  ) {
    if (!validTimezone(input.timezone)) {
      throw new UnprocessableEntityException({
        code: "INVALID_TIMEZONE",
        message: "Use a valid IANA timezone",
      });
    }
    const weeklyMinutes = validateWindows(input.windows);
    if (weeklyMinutes === 0)
      throw new UnprocessableEntityException({
        code: "ZERO_CAPACITY",
        message: "Add at least one availability window",
      });
    const effectiveFrom = new Date();
    effectiveFrom.setUTCHours(0, 0, 0, 0);
    const availability = await this.database.client.studyAvailability.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom } },
      create: {
        id: uuidV7(),
        userId,
        timezone: input.timezone,
        weeklyMinutes,
        maxSessionMinutes: input.maxSessionMinutes,
        dayWindows: input.windows as unknown as Array<{
          day: number;
          startMinute: number;
          endMinute: number;
        }>,
        effectiveFrom,
      },
      update: {
        timezone: input.timezone,
        weeklyMinutes,
        maxSessionMinutes: input.maxSessionMinutes,
        dayWindows: input.windows as unknown as Array<{
          day: number;
          startMinute: number;
          endMinute: number;
        }>,
      },
    });
    await this.database.client.studentProfile.update({
      where: { userId },
      data: { onboardingStatus: "REVIEW" },
    });
    return {
      id: availability.id,
      weeklyMinutes,
      allocatableMinutes: Math.floor(weeklyMinutes * 0.85),
      nextStep: "GAP_ANALYSIS" as const,
    };
  }

  async createMapping(
    reviewerId: string,
    input: {
      curriculumTopicId: string;
      skillId: string;
      breadth: number;
      depth: number;
      confidence: number;
      practiceRequired: boolean;
      evidencePotential: number;
      rationale: string;
      version: number;
    },
  ) {
    const [topic, skill] = await Promise.all([
      this.database.client.curriculumTopic.findUnique({
        where: { id: input.curriculumTopicId },
        include: { program: true },
      }),
      this.database.client.skill.findUnique({
        where: { id: input.skillId },
        include: { dataset: true },
      }),
    ]);
    if (
      !topic ||
      topic.program.status !== "PUBLISHED" ||
      !skill ||
      skill.dataset.status !== "PUBLISHED"
    ) {
      throw new UnprocessableEntityException({
        code: "MAPPING_SOURCE_UNPUBLISHED",
        message: "Mappings require published curriculum and career versions",
      });
    }
    return this.database.client.curriculumSkillMapping.create({
      data: { id: uuidV7(), reviewerId, publishedAt: new Date(), ...input },
    });
  }

  async createGapAnalysis(userId: string) {
    const [profile, goal, availability, assessment] = await Promise.all([
      this.database.client.studentProfile.findUnique({ where: { userId } }),
      this.database.client.careerGoal.findFirst({
        where: { userId, status: "ACTIVE" },
      }),
      this.database.client.studyAvailability.findFirst({
        where: { userId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      }),
      this.database.client.skillAssessment.findFirst({
        where: { userId, status: "SCORED" },
        orderBy: { scoredAt: "desc" },
      }),
    ]);
    if (
      !profile?.curriculumProgramId ||
      !profile.currentSemester ||
      !goal ||
      !availability ||
      !assessment
    ) {
      throw new UnprocessableEntityException({
        code: "MISSING_REQUIRED_INPUT",
        message:
          "Academic profile, goal, scored assessment, and availability are required",
      });
    }
    const currentSemester = profile.currentSemester;
    const requirements =
      await this.database.client.roleSkillRequirement.findMany({
        where: {
          roleVersionId: goal.roleVersionId,
          targetLevel: goal.targetLevel,
        },
        include: { skill: true },
        orderBy: { skillId: "asc" },
      });
    const skillIds = requirements.map(({ skillId }) => skillId);
    const [estimates, mappings] = await Promise.all([
      this.database.client.studentSkill.findMany({
        where: { userId, skillId: { in: skillIds } },
      }),
      this.database.client.curriculumSkillMapping.findMany({
        where: {
          skillId: { in: skillIds },
          curriculumTopic: { programId: profile.curriculumProgramId },
        },
        include: {
          curriculumTopic: {
            include: {
              unit: { include: { subject: { include: { semester: true } } } },
            },
          },
        },
        orderBy: [{ confidence: "desc" }, { depth: "desc" }],
      }),
    ]);
    const estimateBySkill = new Map(
      estimates.map((estimate) => [estimate.skillId, estimate]),
    );
    const mappingBySkill = new Map<string, (typeof mappings)[number]>();
    for (const mapping of mappings)
      if (!mappingBySkill.has(mapping.skillId))
        mappingBySkill.set(mapping.skillId, mapping);
    const deadlineMs = goal.deadline.getTime();
    const weeksUntilDeadline = Math.max(
      1,
      Math.floor((deadlineMs - Date.now()) / (7 * 86_400_000)),
    );
    const engineInputs: GapRequirementInput[] = requirements.map(
      (requirement) => {
        const estimate = estimateBySkill.get(requirement.skillId);
        const mapping = mappingBySkill.get(requirement.skillId);
        const semester = mapping?.curriculumTopic.unit.subject.semester.number;
        return {
          id: requirement.id,
          skillId: requirement.skillId,
          requiredDepth: Number(requirement.requiredDepth),
          importance: Number(requirement.importance),
          required: requirement.required,
          hours: {
            p25: Number(requirement.hoursP25),
            p50: Number(requirement.hoursP50),
            p75: Number(requirement.hoursP75),
          },
          estimate: {
            proficiency:
              estimate?.proficiency === null ||
              estimate?.proficiency === undefined
                ? null
                : Number(estimate.proficiency),
            confidence: estimate ? Number(estimate.confidence) : 0,
            effectiveProficiency:
              estimate?.effectiveProficiency === null ||
              estimate?.effectiveProficiency === undefined
                ? null
                : Number(estimate.effectiveProficiency),
          },
          ...(mapping && semester
            ? {
                curriculum: {
                  depth: Number(mapping.depth),
                  confidence: Number(mapping.confidence),
                  availableBeforeRequiredBy: semester <= currentSemester + 2,
                  current: semester <= currentSemester,
                  trace: mapping.curriculumTopic.stableKey,
                },
              }
            : {}),
        };
      },
    );
    const result = analyzeGap(engineInputs, {
      weeklyMinutes: availability.weeklyMinutes,
      weeksUntilDeadline,
    });
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          profileVersion: profile.lockVersion,
          goalVersion: goal.lockVersion,
          assessmentId: assessment.id,
          availabilityId: availability.id,
          requirements: requirements.map(({ id }) => id),
          mappings: mappings.map(({ id }) => id),
          ruleset: "gap-1.1.0",
        }),
      )
      .digest("hex");
    const existing = await this.database.client.gapAnalysis.findUnique({
      where: { userId_inputHash: { userId, inputHash } },
      include: {
        goal: {
          include: { roleVersion: { include: { domain: true } } },
        },
        curriculumProgram: { include: { branch: true } },
        availability: true,
        items: { include: { skill: true, requirement: true } },
      },
    });
    if (existing) return analysisResponse(existing);
    const id = uuidV7();
    const warningSet = new Set(
      result.items.flatMap(({ warnings }) => warnings),
    );
    const analysis = await this.database.client.gapAnalysis.create({
      data: {
        id,
        userId,
        goalId: goal.id,
        curriculumProgramId: profile.curriculumProgramId,
        careerDatasetId: goal.datasetId,
        assessmentId: assessment.id,
        availabilityId: availability.id,
        rulesetVersion: "gap-1.1.0",
        inputHash,
        status: result.feasibility.status,
        currentContribution: result.contribution.current,
        collegeContribution: result.contribution.college,
        independentGap: result.contribution.independent,
        effortP25Hours: result.effort.p25,
        effortP50Hours: result.effort.p50,
        effortP75Hours: result.effort.p75,
        allocatableMinutes: result.feasibility.allocatableMinutes,
        requiredMinutes: result.feasibility.requiredMinutes,
        deficitMinutes: result.feasibility.deficitMinutes,
        warnings: [...warningSet],
        items: {
          create: result.items.map((item) => {
            const input = engineInputs.find(
              ({ id: requirementId }) => requirementId === item.requirementId,
            )!;
            const mapping = mappingBySkill.get(item.skillId);
            return {
              id: uuidV7(),
              requirementId: item.requirementId,
              skillId: item.skillId,
              classification: item.classification,
              currentProficiency: input.estimate.proficiency,
              evidenceConfidence: input.estimate.confidence,
              effectiveProficiency: input.estimate.effectiveProficiency,
              curriculumDepth: input.curriculum?.depth ?? 0,
              mappingConfidence: input.curriculum?.confidence ?? 0,
              currentRatio: item.currentRatio,
              collegeRatio: item.collegeRatio,
              externalRatio: item.externalRatio,
              effortP25Hours: item.remainingHours.p25,
              effortP50Hours: item.remainingHours.p50,
              effortP75Hours: item.remainingHours.p75,
              reasonCodes: [
                "ROLE_REQUIRED",
                ...(item.classification === "EXTENSION"
                  ? ["ACADEMIC_EXTENSION"]
                  : []),
              ],
              trace: mapping
                ? {
                    topicId: mapping.curriculumTopicId,
                    topicKey: mapping.curriculumTopic.stableKey,
                    subjectCode: mapping.curriculumTopic.unit.subject.code,
                    subjectTitle: mapping.curriculumTopic.unit.subject.title,
                    topicTitle: mapping.curriculumTopic.title,
                    mappingRationale: mapping.rationale,
                    semester:
                      mapping.curriculumTopic.unit.subject.semester.number,
                  }
                : { roleRequirementId: item.requirementId },
            };
          }),
        },
      },
      include: {
        goal: {
          include: { roleVersion: { include: { domain: true } } },
        },
        curriculumProgram: { include: { branch: true } },
        availability: true,
        items: { include: { skill: true, requirement: true } },
      },
    });
    return analysisResponse(analysis);
  }

  async getGapAnalysis(userId: string, id: string) {
    const analysis = await this.database.client.gapAnalysis.findFirst({
      where: { id, userId },
      include: {
        goal: {
          include: { roleVersion: { include: { domain: true } } },
        },
        curriculumProgram: { include: { branch: true } },
        availability: true,
        items: {
          include: { skill: true, requirement: true },
          orderBy: { effortP50Hours: "desc" },
        },
      },
    });
    if (!analysis)
      throw new NotFoundException({
        code: "GAP_ANALYSIS_NOT_FOUND",
        message: "Gap analysis was not found",
      });
    return analysisResponse(analysis);
  }
}
