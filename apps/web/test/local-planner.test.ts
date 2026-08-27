import { describe, expect, it } from "vitest";
import {
  buildLocalPlan,
  catalog,
  rankedRoles,
  type PlannerProfile,
} from "../src/lib/local-planner";

describe("browser-only roadmap planner", () => {
  it("shows only roles with reviewed overlap for the selected branch", () => {
    const roles = rankedRoles("CSE");
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.every((role) => role.matchScore > 0)).toBe(true);
    expect(roles.some((role) => role.key === "software-engineer")).toBe(true);
  });

  it("provides a focused role list for every published branch", () => {
    for (const branch of catalog.branches) {
      const roles = rankedRoles(branch.code);
      expect(roles.length, branch.code).toBeGreaterThan(0);
      expect(roles.length, branch.code).toBeLessThanOrEqual(12);
      expect(
        roles.every((role) => role.specificMatchCount >= 2),
        branch.code,
      ).toBe(true);
    }
  });

  it("builds a complete plan without an API or stored account", () => {
    const profile: PlannerProfile = {
      academic: {
        branchCode: "CSE",
        currentSemester: 4,
        expectedGraduation: "2028-05-01",
      },
      goal: {
        roleKey: "software-engineer",
        targetLevel: "INTERNSHIP_READY",
        deadline: "2027-06-01",
      },
      skillLevels: {},
      availability: {
        maxSessionMinutes: 90,
        dailyMinutes: [0, 60, 60, 60, 60, 60, 0],
      },
    };
    const plan = buildLocalPlan(profile);
    expect(plan?.role.name).toBe("Software Engineer");
    expect(plan?.skills.length).toBeGreaterThan(5);
    expect(plan?.subjects.length).toBeGreaterThan(0);
    expect(plan?.dailyPlan).toHaveLength(5);
    expect(plan?.weeklyPlan.length).toBeGreaterThan(0);
    expect(plan?.monthlyPlan.length).toBeGreaterThan(0);
  });

  it("refuses to invent capacity when the student enters no study time", () => {
    const profile: PlannerProfile = {
      academic: {
        branchCode: "CSE",
        currentSemester: 4,
        expectedGraduation: "2030-05-01",
      },
      goal: {
        roleKey: "software-engineer",
        targetLevel: "INTERNSHIP_READY",
        deadline: "2029-06-01",
      },
      skillLevels: {},
      availability: { maxSessionMinutes: 90, dailyMinutes: Array(7).fill(0) },
    };
    expect(buildLocalPlan(profile)).toBeNull();
  });
});
