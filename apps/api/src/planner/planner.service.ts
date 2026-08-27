import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  aggregateEvidence,
  adaptedUtilizationMinutes,
  completeTaskState,
  materializeWeek,
  planningModePolicy,
  resolvePlanningMode,
  taskEvidenceEstimate,
  transitionTaskState,
  type SchedulableTaskInput,
  type TaskCommand,
  type ExamMode,
} from "@studentos/planning";
import { uuidV7 } from "@studentos/domain";
import { DatabaseService } from "../config/database.service.js";

const DAY_MS = 86_400_000;
type SkipReason =
  "NO_TIME" | "TOO_DIFFICULT" | "ALREADY_KNEW" | "NOT_RELEVANT" | "OTHER";
type DayWindow = { day: number; startMinute: number; endMinute: number };

function localDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new UnprocessableEntityException({
      code: "INVALID_DATE",
      message: "Dates must use YYYY-MM-DD",
    });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new UnprocessableEntityException({
      code: "INVALID_DATE",
      message: "Date is invalid",
    });
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function weekStartFor(value: string): string {
  const date = localDate(value);
  const offset = (date.getUTCDay() + 6) % 7;
  return dateString(addDays(date, -offset));
}

function splitMinutes(total: number, maximum: number): number[] {
  if (total < 10) return [];
  const parts: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const next = Math.min(maximum, remaining);
    if (remaining - next > 0 && remaining - next < 10) {
      parts.push(next - (10 - (remaining - next)));
      remaining = 10;
    } else {
      parts.push(next);
      remaining -= next;
    }
  }
  return parts;
}

function parseWindows(value: unknown): DayWindow[] {
  if (!Array.isArray(value)) throw new Error("Stored availability is invalid");
  const items: unknown[] = value;
  return items.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("day" in item) ||
      !("startMinute" in item) ||
      !("endMinute" in item)
    )
      throw new Error("Stored availability window is invalid");
    const record = item as Record<string, unknown>;
    if (
      typeof record.day !== "number" ||
      typeof record.startMinute !== "number" ||
      typeof record.endMinute !== "number"
    )
      throw new Error("Stored availability window is invalid");
    return {
      day: record.day,
      startMinute: record.startMinute,
      endMinute: record.endMinute,
    };
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function occurrenceResponse(occurrence: {
  id: string;
  status: string;
  lockVersion: number;
  scheduledDate: Date;
  startMinute: number;
  endMinute: number;
  estimatedMinutes: number;
  partialMinutes: number;
  skipReason: string | null;
  skipNote: string | null;
  originalOccurrenceId: string | null;
}) {
  return {
    id: occurrence.id,
    status: occurrence.status,
    lockVersion: occurrence.lockVersion,
    scheduledDate: dateString(occurrence.scheduledDate),
    startMinute: occurrence.startMinute,
    endMinute: occurrence.endMinute,
    estimatedMinutes: occurrence.estimatedMinutes,
    partialMinutes: occurrence.partialMinutes,
    skipReason: occurrence.skipReason,
    skipNote: occurrence.skipNote,
    originalOccurrenceId: occurrence.originalOccurrenceId,
  };
}

@Injectable()
export class PlannerService {
  constructor(private readonly database: DatabaseService) {}

  private async activeContext(userId: string) {
    const roadmap = await this.database.client.roadmap.findFirst({
      where: { userId, activeRevisionId: { not: null }, status: "ACTIVE" },
      include: {
        activeRevision: {
          include: { availability: true },
        },
      },
    });
    if (!roadmap?.activeRevision)
      throw new NotFoundException({
        code: "NO_ACTIVE_ROADMAP",
        message: "An active roadmap is required",
      });
    return {
      roadmap,
      revision: roadmap.activeRevision,
      availability: roadmap.activeRevision.availability,
    };
  }

  private async ensureTasks(
    userId: string,
    revisionId: string,
    maxSessionMinutes: number,
  ): Promise<void> {
    const milestones = await this.database.client.roadmapMilestone.findMany({
      where: { term: { revisionId } },
      include: { term: true, tasks: { select: { id: true } } },
      orderBy: [
        { term: { sequence: "asc" } },
        { priority: "desc" },
        { stableKey: "asc" },
      ],
    });
    await this.database.client.$transaction(async (transaction) => {
      for (const milestone of milestones) {
        if (milestone.tasks.length > 0) continue;
        const parts = splitMinutes(
          milestone.estimatedMinutes,
          maxSessionMinutes,
        );
        for (const [index, minutes] of parts.entries()) {
          await transaction.roadmapTask.create({
            data: {
              id: uuidV7(),
              userId,
              revisionId,
              milestoneId: milestone.id,
              skillId: milestone.skillId,
              sequence: index + 1,
              title:
                parts.length === 1
                  ? milestone.title
                  : `${milestone.title} · ${index + 1}/${parts.length}`,
              track: milestone.track,
              estimatedMinutes: minutes,
              reasonCodes: Array.isArray(milestone.reasonCodes)
                ? milestone.reasonCodes
                : [],
              sourceTrace: {
                ...(milestone.sourceTrace as object),
                roadmapRevisionId: revisionId,
                milestoneId: milestone.id,
                taskPart: index + 1,
                taskParts: parts.length,
              },
            },
          });
        }
      }
    });
  }

  async ensureWeek(userId: string, weekStart: string) {
    const start = localDate(weekStart);
    if (start.getUTCDay() !== 1)
      throw new UnprocessableEntityException({
        code: "INVALID_WEEK_START",
        message: "Week start must be a Monday",
      });
    const { revision, availability } = await this.activeContext(userId);
    const existing = await this.database.client.planningWeek.findUnique({
      where: {
        revisionId_weekStart: { revisionId: revision.id, weekStart: start },
      },
    });
    if (existing) return existing;
    await this.ensureTasks(userId, revision.id, availability.maxSessionMinutes);
    const weekEnd = addDays(start, 6);
    const tasks = await this.database.client.roadmapTask.findMany({
      where: {
        revisionId: revision.id,
        milestone: { term: { startDate: { lte: weekEnd } } },
      },
      include: {
        occurrences: { select: { status: true } },
        retainedFrom: {
          include: { occurrences: { select: { status: true } } },
        },
        milestone: {
          include: {
            prerequisites: { select: { prerequisiteId: true } },
          },
        },
      },
      orderBy: [
        { milestone: { term: { sequence: "asc" } } },
        { milestone: { priority: "desc" } },
        { milestoneId: "asc" },
        { sequence: "asc" },
      ],
    });
    const completedTaskIds = new Set(
      tasks
        .filter(
          ({ occurrences, satisfiedByCompletionId }) =>
            Boolean(satisfiedByCompletionId) ||
            occurrences.some(({ status }) => status === "COMPLETED"),
        )
        .concat(
          tasks.filter(({ retainedFrom }) =>
            retainedFrom?.occurrences.some(
              ({ status }) => status === "COMPLETED",
            ),
          ),
        )
        .map(({ id }) => id),
    );
    const unscheduled = tasks.filter(
      ({ id, occurrences }) =>
        occurrences.length === 0 && !completedTaskIds.has(id),
    );
    const unscheduledIds = new Set(unscheduled.map(({ id }) => id));
    const tasksByMilestone = new Map<string, typeof tasks>();
    for (const task of tasks)
      tasksByMilestone.set(task.milestoneId, [
        ...(tasksByMilestone.get(task.milestoneId) ?? []),
        task,
      ]);
    const dependencies = new Map<string, string[]>();
    for (const task of unscheduled) {
      const priorPart = (tasksByMilestone.get(task.milestoneId) ?? []).find(
        ({ sequence }) => sequence === task.sequence - 1,
      );
      const milestonePrerequisites = task.milestone.prerequisites.flatMap(
        ({ prerequisiteId }) => tasksByMilestone.get(prerequisiteId) ?? [],
      );
      dependencies.set(
        task.id,
        [
          ...(priorPart ? [priorPart.id] : []),
          ...milestonePrerequisites.map(({ id }) => id),
        ].filter((id, index, all) => all.indexOf(id) === index),
      );
    }
    const blocked = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of unscheduled) {
        if (blocked.has(task.id)) continue;
        const isBlocked = (dependencies.get(task.id) ?? []).some(
          (dependencyId) =>
            (!unscheduledIds.has(dependencyId) &&
              !completedTaskIds.has(dependencyId)) ||
            blocked.has(dependencyId),
        );
        if (isBlocked) {
          blocked.add(task.id);
          changed = true;
        }
      }
    }
    const schedulable: SchedulableTaskInput[] = unscheduled
      .filter(({ id }) => !blocked.has(id))
      .map((task) => ({
        id: task.id,
        milestoneId: task.milestoneId,
        title: task.title,
        track: task.track,
        sequence: task.sequence,
        estimatedMinutes: task.estimatedMinutes,
        priority: Number(task.milestone.priority),
        prerequisiteTaskIds: (dependencies.get(task.id) ?? []).filter((id) =>
          unscheduledIds.has(id),
        ),
      }));
    const windows = parseWindows(availability.dayWindows);
    const examPeriods = await this.database.client.examPeriod.findMany({
      where: { userId },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    const modes = Array.from({ length: 7 }, (_, offset) =>
      resolvePlanningMode({
        date: dateString(addDays(start, offset)),
        periods: examPeriods.map((period) => ({
          id: period.id,
          type: period.type,
          startDate: dateString(period.startDate),
          endDate: dateString(period.endDate),
          confirmed: period.confirmed,
        })),
      }),
    );
    const modePriority = {
      NORMAL: 0,
      VACATION: 1,
      PLACEMENT_WEEK: 2,
      INTERNAL_EXAM: 3,
      SEMESTER_EXAM: 4,
    } as const;
    const resolvedMode = [...modes].sort(
      (left, right) => modePriority[right.mode] - modePriority[left.mode],
    )[0]!;
    const policy = planningModePolicy(resolvedMode.mode);
    const snapshot =
      typeof revision.inputSnapshot === "object" &&
      revision.inputSnapshot !== null &&
      !Array.isArray(revision.inputSnapshot)
        ? (revision.inputSnapshot as Record<string, unknown>)
        : {};
    const multiplier =
      typeof snapshot.utilizationMultiplier === "number"
        ? snapshot.utilizationMultiplier
        : 1;
    const rawMinutes = windows.reduce(
      (total, window) => total + window.endMinute - window.startMinute,
      0,
    );
    const capacityLimitMinutes = adaptedUtilizationMinutes({
      declaredMinutes: rawMinutes,
      baseAllocatableMinutes: Math.floor(rawMinutes * 0.85),
      multiplier,
    });
    let modeTasks = schedulable.filter(
      (task) => !policy.deferredTracks.includes(task.track),
    );
    let modeTaskIds = new Set(modeTasks.map(({ id }) => id));
    let removedForDependency = true;
    while (removedForDependency) {
      const next = modeTasks.filter((task) =>
        task.prerequisiteTaskIds.every((id) => modeTaskIds.has(id)),
      );
      removedForDependency = next.length !== modeTasks.length;
      modeTasks = next;
      modeTaskIds = new Set(modeTasks.map(({ id }) => id));
    }
    const constrained =
      resolvedMode.mode !== "NORMAL" && resolvedMode.mode !== "VACATION";
    const materialized = materializeWeek({
      weekStart,
      timezone: availability.timezone,
      windows,
      maxSessionMinutes: availability.maxSessionMinutes,
      tasks: modeTasks,
      capacityLimitMinutes,
      ...(constrained
        ? {
            academicLimitMinutes: Math.floor(
              capacityLimitMinutes * policy.academicShare.max,
            ),
            careerLimitMinutes: Math.floor(
              capacityLimitMinutes * policy.careerShare.max,
            ),
          }
        : {}),
      ...(policy.maxCareerMinutesPerDay === null
        ? {}
        : { maxCareerMinutesPerDay: policy.maxCareerMinutesPerDay }),
      ...(policy.maxCareerSessionsPerWeek === null
        ? {}
        : { maxCareerSessionsPerWeek: policy.maxCareerSessionsPerWeek }),
    });
    return this.database.client.$transaction(async (transaction) => {
      const weekId = uuidV7();
      const week = await transaction.planningWeek.create({
        data: {
          id: weekId,
          userId,
          revisionId: revision.id,
          availabilityId: availability.id,
          weekStart: start,
          timezone: availability.timezone,
          rawMinutes: materialized.rawMinutes,
          allocatableMinutes: materialized.allocatableMinutes,
          scheduledMinutes: materialized.scheduledMinutes,
          catchupMinutes: materialized.catchupMinutes,
          planningMode: resolvedMode.mode,
          modePolicy: {
            ...policy,
            utilizationMultiplier: multiplier,
            confirmationRequiredIds: [
              ...new Set(
                modes.flatMap(
                  ({ confirmationRequiredIds }) => confirmationRequiredIds,
                ),
              ),
            ],
          },
        },
      });
      const dayIdByDate = new Map<string, string>();
      for (let offset = 0; offset < 7; offset += 1) {
        const date = addDays(start, offset);
        const dateValue = dateString(date);
        const jsDay = date.getUTCDay();
        const rawMinutes = windows
          .filter(({ day }) => day === jsDay)
          .reduce(
            (sum, window) => sum + window.endMinute - window.startMinute,
            0,
          );
        const scheduledMinutes = materialized.tasks
          .filter(({ localDate: taskDate }) => taskDate === dateValue)
          .reduce((sum, task) => sum + task.estimatedMinutes, 0);
        const dayId = uuidV7();
        dayIdByDate.set(dateValue, dayId);
        await transaction.planningDay.create({
          data: {
            id: dayId,
            weekId,
            localDate: date,
            rawMinutes,
            scheduledMinutes,
          },
        });
      }
      for (const task of materialized.tasks) {
        await transaction.taskOccurrence.create({
          data: {
            id: uuidV7(),
            userId,
            taskId: task.id,
            weekId,
            dayId: dayIdByDate.get(task.localDate)!,
            scheduledDate: localDate(task.localDate),
            startMinute: task.startMinute,
            endMinute: task.endMinute,
            estimatedMinutes: task.estimatedMinutes,
          },
        });
      }
      return week;
    });
  }

  private async weekResponse(userId: string, weekStart: string) {
    const { revision } = await this.activeContext(userId);
    const week = await this.database.client.planningWeek.findFirst({
      where: {
        userId,
        revisionId: revision.id,
        weekStart: localDate(weekStart),
      },
      include: {
        days: {
          include: {
            occurrences: {
              include: { task: { include: { skill: true, milestone: true } } },
              orderBy: [{ startMinute: "asc" }, { id: "asc" }],
            },
          },
          orderBy: { localDate: "asc" },
        },
      },
    });
    if (!week)
      throw new NotFoundException({
        code: "PLAN_NOT_FOUND",
        message: "Plan was not found",
      });
    const activeOccurrences = week.days
      .flatMap(({ occurrences }) => occurrences)
      .filter(({ status }) => status !== "RESCHEDULED" && status !== "SKIPPED");
    const trackMinutes = new Map<string, number>();
    for (const occurrence of activeOccurrences)
      trackMinutes.set(
        occurrence.task.track,
        (trackMinutes.get(occurrence.task.track) ?? 0) +
          occurrence.estimatedMinutes,
      );
    return {
      id: week.id,
      revisionId: revision.id,
      weekStart: dateString(week.weekStart),
      timezone: week.timezone,
      planningMode: week.planningMode,
      modePolicy: week.modePolicy,
      capacity: {
        rawMinutes: week.rawMinutes,
        allocatableMinutes: week.allocatableMinutes,
        scheduledMinutes: week.scheduledMinutes,
        catchupMinutes: week.catchupMinutes,
      },
      trackMinutes: Object.fromEntries([...trackMinutes.entries()].sort()),
      days: week.days.map((day) => ({
        id: day.id,
        date: dateString(day.localDate),
        rawMinutes: day.rawMinutes,
        scheduledMinutes: day.scheduledMinutes,
        tasks: day.occurrences.map((occurrence) => ({
          ...occurrenceResponse(occurrence),
          taskId: occurrence.taskId,
          title: occurrence.task.title,
          track: occurrence.task.track,
          skill: {
            id: occurrence.task.skill.id,
            key: occurrence.task.skill.stableKey,
            name: occurrence.task.skill.name,
          },
          why: occurrence.task.reasonCodes,
          trace: occurrence.task.sourceTrace,
          milestoneId: occurrence.task.milestoneId,
        })),
      })),
    };
  }

  async week(userId: string, weekStart: string) {
    await this.ensureWeek(userId, weekStart);
    return this.weekResponse(userId, weekStart);
  }

  async today(userId: string, date?: string) {
    const requested =
      date ??
      dateInTimezone(
        new Date(),
        (await this.activeContext(userId)).availability.timezone,
      );
    const requestedDate = localDate(requested);
    const distance = Math.abs(requestedDate.getTime() - Date.now()) / DAY_MS;
    if (distance > 370)
      throw new UnprocessableEntityException({
        code: "DATE_OUTSIDE_HORIZON",
        message: "Today reads are limited to the retained planning horizon",
      });
    const week = await this.week(userId, weekStartFor(requested));
    const day = week.days.find(({ date: dayDate }) => dayDate === requested);
    if (!day)
      throw new NotFoundException({
        code: "DAY_NOT_FOUND",
        message: "Day was not found",
      });
    const nextTask =
      day.tasks.find(({ status }) => status === "IN_PROGRESS") ??
      day.tasks.find(({ status }) => status === "PLANNED") ??
      null;
    return {
      date: requested,
      timezone: week.timezone,
      week: { id: week.id, weekStart: week.weekStart, capacity: week.capacity },
      day,
      nextTaskId: nextTask?.id ?? null,
    };
  }

  private async dependencyBlockers(occurrenceId: string): Promise<string[]> {
    const occurrence =
      await this.database.client.taskOccurrence.findUniqueOrThrow({
        where: { id: occurrenceId },
        include: {
          task: {
            include: {
              milestone: { include: { prerequisites: true } },
            },
          },
        },
      });
    const prerequisiteMilestoneIds =
      occurrence.task.milestone.prerequisites.map(
        ({ prerequisiteId }) => prerequisiteId,
      );
    const prerequisiteTasks = await this.database.client.roadmapTask.findMany({
      where: {
        revisionId: occurrence.task.revisionId,
        OR: [
          {
            milestoneId: occurrence.task.milestoneId,
            sequence: { lt: occurrence.task.sequence },
          },
          { milestoneId: { in: prerequisiteMilestoneIds } },
        ],
      },
      include: { occurrences: { select: { status: true } } },
    });
    return prerequisiteTasks
      .filter(
        ({ occurrences }) =>
          !occurrences.some(({ status }) => status === "COMPLETED"),
      )
      .map(({ id }) => id);
  }

  async command(
    userId: string,
    occurrenceId: string,
    idempotencyKey: string,
    input: {
      command: TaskCommand;
      expectedVersion: number;
      partialMinutes?: number;
      skipReason?: SkipReason;
      skipNote?: string;
      rescheduleDate?: string;
    },
  ) {
    const requestHash = hash(input);
    const prior = await this.database.client.taskCommandRecord.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency key was already used for a different command",
        });
      return prior.response;
    }
    const occurrence = await this.database.client.taskOccurrence.findFirst({
      where: {
        id: occurrenceId,
        userId,
        task: { revision: { activeForRoadmap: { is: { userId } } } },
      },
      include: { task: { select: { track: true } } },
    });
    if (!occurrence)
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Task occurrence was not found",
      });
    if (occurrence.lockVersion !== input.expectedVersion)
      throw new ConflictException({
        code: "PLAN_VERSION_CONFLICT",
        message: "Task occurrence changed; refresh before retrying",
      });
    let nextStatus: ReturnType<typeof transitionTaskState>;
    try {
      nextStatus = transitionTaskState(occurrence.status, input.command);
    } catch {
      throw new ConflictException({
        code: "INVALID_STATE",
        message: `Cannot ${input.command.toLowerCase()} a ${occurrence.status.toLowerCase()} task`,
      });
    }
    if (input.command === "START") {
      const blockers = await this.dependencyBlockers(occurrence.id);
      if (blockers.length > 0)
        throw new ConflictException({
          code: "DEPENDENCY_BLOCKED",
          message: "Complete prerequisite tasks first",
          blockerTaskIds: blockers,
        });
    }
    if (
      input.command === "PARTIAL" &&
      (!input.partialMinutes ||
        input.partialMinutes <= occurrence.partialMinutes ||
        input.partialMinutes >= occurrence.estimatedMinutes)
    )
      throw new UnprocessableEntityException({
        code: "INVALID_PARTIAL_MINUTES",
        message: "Partial minutes must increase and remain below the estimate",
      });
    if (input.command === "SKIP" && !input.skipReason)
      throw new UnprocessableEntityException({
        code: "SKIP_REASON_REQUIRED",
        message: "A skip reason is required",
      });
    if (input.command === "RESCHEDULE")
      return this.reschedule(
        userId,
        occurrence,
        idempotencyKey,
        requestHash,
        input.rescheduleDate,
      );
    const response = await this.database.client.$transaction(
      async (transaction) => {
        const updated = await transaction.taskOccurrence.updateMany({
          where: { id: occurrence.id, lockVersion: input.expectedVersion },
          data: {
            status: nextStatus,
            lockVersion: { increment: 1 },
            ...(input.command === "PARTIAL"
              ? { partialMinutes: input.partialMinutes }
              : {}),
            ...(input.command === "SKIP"
              ? {
                  skipReason: input.skipReason,
                  skipNote: input.skipNote ?? null,
                }
              : {}),
          },
        });
        if (updated.count !== 1)
          throw new ConflictException({
            code: "PLAN_VERSION_CONFLICT",
            message: "Task occurrence changed; refresh before retrying",
          });
        const saved = await transaction.taskOccurrence.findUniqueOrThrow({
          where: { id: occurrence.id },
        });
        const body = occurrenceResponse(saved);
        await transaction.taskCommandRecord.create({
          data: {
            id: uuidV7(),
            userId,
            occurrenceId: occurrence.id,
            idempotencyKey,
            command: input.command,
            requestHash,
            response: body,
          },
        });
        return body;
      },
    );
    return response;
  }

  private async reschedule(
    userId: string,
    occurrence: {
      id: string;
      taskId: string;
      weekId: string;
      dayId: string;
      estimatedMinutes: number;
      lockVersion: number;
      task: {
        track: "ACADEMIC" | "CAREER" | "PROJECT" | "PLACEMENT";
      };
    },
    idempotencyKey: string,
    requestHash: string,
    targetValue?: string,
  ) {
    if (!targetValue)
      throw new UnprocessableEntityException({
        code: "RESCHEDULE_DATE_REQUIRED",
        message: "A replacement date is required",
      });
    const targetDate = localDate(targetValue);
    const targetWeekStart = weekStartFor(targetValue);
    const targetWeek = await this.ensureWeek(userId, targetWeekStart);
    const targetDay = await this.database.client.planningDay.findUniqueOrThrow({
      where: {
        weekId_localDate: { weekId: targetWeek.id, localDate: targetDate },
      },
    });
    const availability =
      await this.database.client.studyAvailability.findUniqueOrThrow({
        where: { id: targetWeek.availabilityId },
      });
    const windows = parseWindows(availability.dayWindows).filter(
      ({ day }) => day === targetDate.getUTCDay(),
    );
    const existing = await this.database.client.taskOccurrence.findMany({
      where: {
        dayId: targetDay.id,
        id: { not: occurrence.id },
        status: { notIn: ["SKIPPED", "RESCHEDULED"] },
      },
      orderBy: { startMinute: "asc" },
    });
    let startMinute: number | undefined;
    for (const window of windows) {
      let cursor = window.startMinute;
      for (const item of existing.filter(
        ({ startMinute: start }) =>
          start >= window.startMinute && start < window.endMinute,
      )) {
        if (item.startMinute - cursor >= occurrence.estimatedMinutes) break;
        cursor = Math.max(cursor, item.endMinute);
      }
      if (window.endMinute - cursor >= occurrence.estimatedMinutes) {
        startMinute = cursor;
        break;
      }
    }
    const sameWeek = occurrence.weekId === targetWeek.id;
    const targetPlanned =
      targetWeek.scheduledMinutes +
      occurrence.estimatedMinutes -
      (sameWeek ? occurrence.estimatedMinutes : 0);
    const constrainedMode = ["INTERNAL_EXAM", "SEMESTER_EXAM"].includes(
      targetWeek.planningMode,
    );
    if (constrainedMode && occurrence.task.track !== "ACADEMIC") {
      const policy = planningModePolicy(targetWeek.planningMode as ExamMode);
      const careerOccurrences =
        await this.database.client.taskOccurrence.findMany({
          where: {
            weekId: targetWeek.id,
            id: { not: occurrence.id },
            status: { notIn: ["SKIPPED", "RESCHEDULED"] },
            task: { track: { not: "ACADEMIC" } },
          },
          select: {
            dayId: true,
            estimatedMinutes: true,
          },
        });
      const careerMinutes = careerOccurrences.reduce(
        (total, item) => total + item.estimatedMinutes,
        occurrence.estimatedMinutes,
      );
      const careerDayMinutes = careerOccurrences
        .filter(({ dayId }) => dayId === targetDay.id)
        .reduce(
          (total, item) => total + item.estimatedMinutes,
          occurrence.estimatedMinutes,
        );
      const careerLimit = Math.floor(
        targetWeek.allocatableMinutes * policy.careerShare.max,
      );
      if (
        careerMinutes > careerLimit ||
        (policy.maxCareerMinutesPerDay !== null &&
          careerDayMinutes > policy.maxCareerMinutesPerDay) ||
        (policy.maxCareerSessionsPerWeek !== null &&
          careerOccurrences.length + 1 > policy.maxCareerSessionsPerWeek)
      )
        throw new UnprocessableEntityException({
          code: "EXAM_MODE_LIMIT",
          message:
            "The rescheduled career task would exceed this exam week's protected academic capacity",
        });
    }
    if (
      startMinute === undefined ||
      targetPlanned > targetWeek.allocatableMinutes
    )
      throw new UnprocessableEntityException({
        code: "TARGET_DAY_FULL",
        message: "The selected date has no feasible availability slot",
      });
    return this.database.client.$transaction(async (transaction) => {
      const changed = await transaction.taskOccurrence.updateMany({
        where: {
          id: occurrence.id,
          lockVersion: occurrence.lockVersion,
          status: "PLANNED",
        },
        data: { status: "RESCHEDULED", lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException({
          code: "PLAN_VERSION_CONFLICT",
          message: "Task occurrence changed; refresh before retrying",
        });
      const replacement = await transaction.taskOccurrence.create({
        data: {
          id: uuidV7(),
          userId,
          taskId: occurrence.taskId,
          weekId: targetWeek.id,
          dayId: targetDay.id,
          originalOccurrenceId: occurrence.id,
          scheduledDate: targetDate,
          startMinute,
          endMinute: startMinute + occurrence.estimatedMinutes,
          estimatedMinutes: occurrence.estimatedMinutes,
        },
      });
      if (!sameWeek) {
        await transaction.planningWeek.update({
          where: { id: occurrence.weekId },
          data: {
            scheduledMinutes: { decrement: occurrence.estimatedMinutes },
            lockVersion: { increment: 1 },
          },
        });
        await transaction.planningDay.update({
          where: { id: occurrence.dayId },
          data: {
            scheduledMinutes: { decrement: occurrence.estimatedMinutes },
          },
        });
        await transaction.planningWeek.update({
          where: { id: targetWeek.id },
          data: {
            scheduledMinutes: { increment: occurrence.estimatedMinutes },
            lockVersion: { increment: 1 },
          },
        });
      }
      if (occurrence.dayId !== targetDay.id) {
        if (sameWeek)
          await transaction.planningDay.update({
            where: { id: occurrence.dayId },
            data: {
              scheduledMinutes: { decrement: occurrence.estimatedMinutes },
            },
          });
        await transaction.planningDay.update({
          where: { id: targetDay.id },
          data: {
            scheduledMinutes: { increment: occurrence.estimatedMinutes },
          },
        });
      }
      const body = {
        originalId: occurrence.id,
        replacement: occurrenceResponse(replacement),
      };
      await transaction.taskCommandRecord.create({
        data: {
          id: uuidV7(),
          userId,
          occurrenceId: occurrence.id,
          idempotencyKey,
          command: "RESCHEDULE",
          requestHash,
          response: body,
        },
      });
      return body;
    });
  }

  async complete(
    userId: string,
    occurrenceId: string,
    idempotencyKey: string,
    input: {
      expectedVersion: number;
      actualMinutes: number;
      outcome: string;
      artifactUrl?: string;
    },
  ) {
    const requestHash = hash({ occurrenceId, ...input });
    const prior = await this.database.client.taskCompletion.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { occurrence: true },
    });
    if (prior) {
      if (
        prior.occurrenceId !== occurrenceId ||
        prior.requestHash !== requestHash
      )
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message:
            "Idempotency key was already used for a different completion",
        });
      return {
        id: prior.id,
        occurrence: occurrenceResponse(prior.occurrence),
        actualMinutes: prior.actualMinutes,
        outcome: prior.outcome,
        artifactUrl: prior.artifactUrl,
      };
    }
    const occurrence = await this.database.client.taskOccurrence.findFirst({
      where: {
        id: occurrenceId,
        userId,
        task: { revision: { activeForRoadmap: { is: { userId } } } },
      },
    });
    if (!occurrence)
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Task occurrence was not found",
      });
    if (occurrence.lockVersion !== input.expectedVersion)
      throw new ConflictException({
        code: "PLAN_VERSION_CONFLICT",
        message: "Task changed; refresh",
      });
    try {
      completeTaskState(occurrence.status);
    } catch {
      throw new ConflictException({
        code:
          occurrence.status === "COMPLETED"
            ? "ALREADY_COMPLETED"
            : "INVALID_STATE",
        message: "Only an active or partial task can be completed",
      });
    }
    if (input.artifactUrl) {
      let url: URL;
      try {
        url = new URL(input.artifactUrl);
      } catch {
        throw new UnprocessableEntityException({
          code: "INVALID_ARTIFACT_URL",
          message: "Artifact URL is invalid",
        });
      }
      if (
        url.protocol !== "https:" ||
        !["github.com", "gitlab.com", "docs.google.com"].includes(
          url.hostname.toLowerCase(),
        )
      )
        throw new UnprocessableEntityException({
          code: "ARTIFACT_HOST_NOT_ALLOWED",
          message: "Artifact URL must use an approved HTTPS host",
        });
    }
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.taskOccurrence.updateMany({
        where: {
          id: occurrence.id,
          lockVersion: input.expectedVersion,
          status: occurrence.status,
        },
        data: { status: "COMPLETED", lockVersion: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException({
          code: "PLAN_VERSION_CONFLICT",
          message: "Task changed; refresh",
        });
      const saved = await transaction.taskOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      const completion = await transaction.taskCompletion.create({
        data: {
          id: uuidV7(),
          userId,
          occurrenceId: occurrence.id,
          idempotencyKey,
          requestHash,
          actualMinutes: input.actualMinutes,
          outcome: input.outcome,
          artifactUrl: input.artifactUrl ?? null,
        },
      });
      const task = await transaction.roadmapTask.findUniqueOrThrow({
        where: { id: occurrence.taskId },
        include: { skill: true },
      });
      const currentEstimate = await transaction.studentSkill.findUnique({
        where: { userId_skillId: { userId, skillId: task.skillId } },
      });
      const evidenceValue = taskEvidenceEstimate({
        currentProficiency:
          currentEstimate?.proficiency === null ||
          currentEstimate?.proficiency === undefined
            ? null
            : Number(currentEstimate.proficiency),
        hasArtifact: Boolean(input.artifactUrl),
      });
      const evidenceId = uuidV7();
      const occurredAt = new Date();
      await transaction.skillEvidence.create({
        data: {
          id: evidenceId,
          userId,
          skillId: task.skillId,
          sourceType: "TASK_COMPLETION",
          sourceId: completion.id,
          proficiency: evidenceValue.proficiency,
          confidence: evidenceValue.confidence,
          occurredAt,
          metadata: {
            taskId: task.id,
            occurrenceId: occurrence.id,
            roadmapRevisionId: task.revisionId,
            artifactBacked: Boolean(input.artifactUrl),
          },
        },
      });
      const evidence = await transaction.skillEvidence.findMany({
        where: { userId, skillId: task.skillId },
      });
      const aggregate = aggregateEvidence(
        evidence.map((item) => ({
          proficiency: Number(item.proficiency),
          confidence: Number(item.confidence),
          occurredAt: item.occurredAt,
          decayDays: task.skill.evidenceDecayDays,
        })),
        occurredAt,
      );
      await transaction.studentSkill.upsert({
        where: { userId_skillId: { userId, skillId: task.skillId } },
        create: {
          id: uuidV7(),
          userId,
          skillId: task.skillId,
          proficiency: aggregate.proficiency,
          confidence: aggregate.confidence,
          effectiveProficiency: aggregate.effectiveProficiency,
          algorithmVersion: "evidence-1.0.0",
          lastEvidencedAt: occurredAt,
        },
        update: {
          proficiency: aggregate.proficiency,
          confidence: aggregate.confidence,
          effectiveProficiency: aggregate.effectiveProficiency,
          algorithmVersion: "evidence-1.0.0",
          lastEvidencedAt: occurredAt,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          id: uuidV7(),
          aggregateType: "TaskOccurrence",
          aggregateId: occurrence.id,
          eventType: "task.completed.v1",
          payload: {
            completionId: completion.id,
            evidenceId,
            skillId: task.skillId,
            actualMinutes: input.actualMinutes,
          },
        },
      });
      return {
        id: completion.id,
        occurrence: occurrenceResponse(saved),
        actualMinutes: completion.actualMinutes,
        outcome: completion.outcome,
        artifactUrl: completion.artifactUrl,
      };
    });
  }
}
