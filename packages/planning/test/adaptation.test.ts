import { describe, expect, it } from "vitest";
import {
  adaptedUtilizationMinutes,
  calculateAdaptiveLoad,
  diffRoadmapTasks,
  materializeWeek,
  placeDeferredWork,
  planningModePolicy,
  resolvePlanningMode,
  revisionConsent,
} from "../src/index.js";

describe("adaptive planning and exam mode", () => {
  it("requires two weeks and applies the four-week EWMA rules", () => {
    expect(
      calculateAdaptiveLoad([
        {
          completionRate: 0.3,
          difficulty: "TOO_DIFFICULT",
          earlyFinish: false,
        },
      ]),
    ).toMatchObject({ multiplier: 1, action: "INSUFFICIENT_DATA" });
    expect(
      calculateAdaptiveLoad([
        {
          completionRate: 0.7,
          difficulty: "TOO_DIFFICULT",
          earlyFinish: false,
        },
        {
          completionRate: 0.7,
          difficulty: "TOO_DIFFICULT",
          earlyFinish: false,
        },
      ]),
    ).toMatchObject({ multiplier: 0.8, action: "DEFER_AND_SPLIT" });
    expect(
      calculateAdaptiveLoad([
        { completionRate: 1.1, difficulty: "TOO_EASY", earlyFinish: true },
        { completionRate: 1.1, difficulty: "TOO_EASY", earlyFinish: true },
      ]),
    ).toMatchObject({ multiplier: 1.1, action: "BRING_FORWARD" });
  });

  it("never expands load beyond declared availability", () => {
    expect(
      adaptedUtilizationMinutes({
        declaredMinutes: 600,
        baseAllocatableMinutes: 510,
        multiplier: 1.1,
      }),
    ).toBe(561);
    expect(
      adaptedUtilizationMinutes({
        declaredMinutes: 500,
        baseAllocatableMinutes: 490,
        multiplier: 1.15,
      }),
    ).toBe(500);
  });

  it("uses confirmed overlap priority and requests confirmation without changing mode", () => {
    const periods = [
      {
        id: "internal",
        type: "INTERNAL_EXAM" as const,
        startDate: "2026-09-10",
        endDate: "2026-09-14",
        confirmed: true,
      },
      {
        id: "semester",
        type: "SEMESTER_EXAM" as const,
        startDate: "2026-09-15",
        endDate: "2026-09-30",
        confirmed: true,
      },
      {
        id: "template-unconfirmed",
        type: "INTERNAL_EXAM" as const,
        startDate: "2026-09-12",
        endDate: "2026-09-13",
        confirmed: false,
      },
    ];
    expect(resolvePlanningMode({ date: "2026-09-08", periods })).toEqual({
      mode: "SEMESTER_EXAM",
      periodId: "semester",
      confirmationRequiredIds: ["template-unconfirmed"],
    });
  });

  it("enforces semester-exam continuity without consuming academic capacity", () => {
    const policy = planningModePolicy("SEMESTER_EXAM");
    const result = materializeWeek({
      weekStart: "2026-09-07",
      timezone: "Asia/Kolkata",
      windows: [
        { day: 1, startMinute: 1080, endMinute: 1200 },
        { day: 2, startMinute: 1080, endMinute: 1200 },
        { day: 3, startMinute: 1080, endMinute: 1200 },
        { day: 4, startMinute: 1080, endMinute: 1200 },
        { day: 5, startMinute: 1080, endMinute: 1200 },
      ],
      maxSessionMinutes: 60,
      tasks: [
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `academic-${index}`,
          milestoneId: `am-${index}`,
          title: "Academic revision",
          track: "ACADEMIC" as const,
          sequence: 1,
          estimatedMinutes: 45,
          priority: 100 - index,
          prerequisiteTaskIds: [],
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `career-${index}`,
          milestoneId: `cm-${index}`,
          title: "Career continuity",
          track: "CAREER" as const,
          sequence: 1,
          estimatedMinutes: 45,
          priority: 80 - index,
          prerequisiteTaskIds: [],
        })),
      ],
      academicLimitMinutes: Math.floor(510 * policy.academicShare.max),
      careerLimitMinutes: Math.floor(510 * policy.careerShare.max),
      maxCareerMinutesPerDay: policy.maxCareerMinutesPerDay!,
      maxCareerSessionsPerWeek: policy.maxCareerSessionsPerWeek!,
    });
    const career = result.tasks.filter(({ track }) => track !== "ACADEMIC");
    expect(career).toHaveLength(2);
    expect(
      career.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    ).toBeLessThanOrEqual(Math.floor(510 * 0.2));
    expect(result.scheduledMinutes).toBeLessThanOrEqual(
      result.allocatableMinutes,
    );
  });

  it("returns deferred work to real spare capacity without a catch-up spike", () => {
    const result = placeDeferredWork(
      [
        {
          id: "required",
          estimatedMinutes: 120,
          priority: 1,
          required: true,
          dueDate: "2026-10-05",
        },
        {
          id: "optional",
          estimatedMinutes: 180,
          priority: 0.5,
          required: false,
          dueDate: "2026-10-12",
        },
      ],
      [
        {
          weekStart: "2026-10-05",
          allocatableMinutes: 510,
          alreadyScheduledMinutes: 420,
        },
        {
          weekStart: "2026-10-12",
          allocatableMinutes: 510,
          alreadyScheduledMinutes: 330,
        },
      ],
    );
    expect(result.assignments).toEqual([
      { taskId: "optional", weekStart: "2026-10-12" },
    ]);
    expect(result.unplacedTaskIds).toEqual(["required"]);
    expect(result.deadlineImpact).toBe(true);
  });
});

describe("roadmap revision diff and consent", () => {
  it("retains shared canonical work, locks history, and groups role changes", () => {
    const result = diffRoadmapTasks(
      [
        {
          id: "done",
          stableKey: "sql",
          canonicalSkillId: "sql",
          depth: 0.4,
          estimatedMinutes: 60,
          targetDate: "2026-09-01",
          state: "COMPLETED",
        },
        {
          id: "shared-old",
          stableKey: "git",
          canonicalSkillId: "git",
          depth: 0.4,
          estimatedMinutes: 60,
          targetDate: "2026-10-01",
          state: "PLANNED",
        },
        {
          id: "removed",
          stableKey: "react",
          canonicalSkillId: "react",
          depth: 0.6,
          estimatedMinutes: 120,
          targetDate: "2026-11-01",
          state: "PLANNED",
        },
      ],
      [
        {
          id: "shared-new",
          stableKey: "git",
          canonicalSkillId: "git",
          depth: 0.4,
          estimatedMinutes: 60,
          targetDate: "2026-10-01",
          state: "PLANNED",
        },
        {
          id: "added",
          stableKey: "statistics",
          canonicalSkillId: "statistics",
          depth: 0.5,
          estimatedMinutes: 180,
          targetDate: "2026-11-15",
          state: "PLANNED",
        },
      ],
    );
    expect(result.retained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ previousId: "done", locked: true }),
        expect.objectContaining({ previousId: "shared-old", locked: false }),
      ]),
    );
    expect(result.new.map(({ id }) => id)).toEqual(["added"]);
    expect(result.noLongerRequired.map(({ id }) => id)).toEqual(["removed"]);
    expect(
      revisionConsent({
        trigger: "ROLE",
        hoursMovedPercent: result.hoursMovedPercent,
        milestoneDateChanges: result.milestoneDateChanges,
      }),
    ).toEqual({ required: true, autoEligible: false });
  });

  it("only auto-qualifies small weekly changes without milestone date movement", () => {
    expect(
      revisionConsent({
        trigger: "WEEKLY",
        hoursMovedPercent: 8,
        milestoneDateChanges: 0,
      }),
    ).toEqual({ required: false, autoEligible: true });
    expect(
      revisionConsent({
        trigger: "WEEKLY",
        hoursMovedPercent: 8,
        milestoneDateChanges: 1,
      }),
    ).toEqual({ required: true, autoEligible: false });
  });
});
