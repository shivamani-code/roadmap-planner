import { describe, expect, it } from "vitest";
import {
  completeTaskState,
  materializeWeek,
  transitionTaskState,
  type SchedulableTaskInput,
} from "../src/index.js";

const task = (
  id: string,
  overrides: Partial<SchedulableTaskInput> = {},
): SchedulableTaskInput => ({
  id,
  milestoneId: `milestone-${id}`,
  title: id,
  track: "CAREER",
  sequence: 1,
  estimatedMinutes: 45,
  priority: 50,
  prerequisiteTaskIds: [],
  ...overrides,
});

describe("study scheduler and task states", () => {
  it("enforces the explicit occurrence state machine", () => {
    expect(transitionTaskState("PLANNED", "START")).toBe("IN_PROGRESS");
    expect(transitionTaskState("IN_PROGRESS", "PARTIAL")).toBe("PARTIAL");
    expect(transitionTaskState("PARTIAL", "START")).toBe("IN_PROGRESS");
    expect(transitionTaskState("PLANNED", "SKIP")).toBe("SKIPPED");
    expect(transitionTaskState("PLANNED", "RESCHEDULE")).toBe("RESCHEDULED");
    expect(completeTaskState("IN_PROGRESS")).toBe("COMPLETED");
    expect(() => transitionTaskState("COMPLETED", "START")).toThrow(
      "Invalid task transition",
    );
    expect(() => completeTaskState("PLANNED")).toThrow(
      "Invalid task completion",
    );
  });

  it("stays within day, week, reserve, session, and dependency constraints", () => {
    const result = materializeWeek({
      weekStart: "2026-08-24",
      timezone: "Asia/Kolkata",
      maxSessionMinutes: 60,
      windows: Array.from({ length: 5 }, (_, index) => ({
        day: index + 1,
        startMinute: 1080,
        endMinute: 1200,
      })),
      tasks: [
        task("foundation", { priority: 100 }),
        task("advanced", {
          priority: 99,
          prerequisiteTaskIds: ["foundation"],
        }),
        ...Array.from({ length: 20 }, (_, index) => task(`extra-${index}`)),
      ],
    });
    expect(result.rawMinutes).toBe(600);
    expect(result.allocatableMinutes).toBe(510);
    expect(result.scheduledMinutes).toBeLessThanOrEqual(510);
    expect(
      result.tasks.every(({ estimatedMinutes }) => estimatedMinutes <= 60),
    ).toBe(true);
    expect(
      result.tasks.findIndex(({ id }) => id === "foundation"),
    ).toBeLessThan(result.tasks.findIndex(({ id }) => id === "advanced"));
    const countByDay = new Map<string, number>();
    for (const scheduled of result.tasks)
      countByDay.set(
        scheduled.localDate,
        (countByDay.get(scheduled.localDate) ?? 0) + 1,
      );
    expect([...countByDay.values()].every((count) => count <= 3)).toBe(true);
  });

  it("keeps local-date capacity stable through a DST transition", () => {
    const result = materializeWeek({
      weekStart: "2026-10-26",
      timezone: "America/New_York",
      maxSessionMinutes: 90,
      windows: [
        { day: 0, startMinute: 540, endMinute: 660 },
        { day: 1, startMinute: 1080, endMinute: 1200 },
      ],
      tasks: [task("one", { estimatedMinutes: 60 })],
    });
    expect(result.rawMinutes).toBe(240);
    expect(result.allocatableMinutes).toBe(204);
    expect(result.tasks[0]?.localDate).toBe("2026-10-26");
  });

  it("is deterministic over randomized task loads", () => {
    let state = 37;
    const random = (): number => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    for (let run = 0; run < 500; run += 1) {
      const tasks = Array.from({ length: 30 }, (_, index) =>
        task(`task-${index}`, {
          estimatedMinutes: 15 + Math.floor(random() * 4) * 15,
          priority: random() * 100,
        }),
      );
      const input = {
        weekStart: "2026-08-24",
        timezone: "Asia/Kolkata",
        maxSessionMinutes: 90,
        windows: Array.from({ length: 7 }, (_, day) => ({
          day,
          startMinute: 1080,
          endMinute: 1260,
        })),
        tasks,
      };
      expect(materializeWeek(input)).toEqual(materializeWeek(input));
      expect(materializeWeek(input).scheduledMinutes).toBeLessThanOrEqual(
        Math.floor(7 * 180 * 0.85),
      );
    }
  });
});
