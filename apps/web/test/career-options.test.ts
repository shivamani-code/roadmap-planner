import { describe, expect, it } from "vitest";
import { formatTargetLevel, roleLevel } from "../src/lib/career-options";
import type { CareerRoleOption } from "@studentos/contracts";

describe("career option presentation", () => {
  it("finds the selected target level without inventing a fallback", () => {
    const role = {
      targetLevels: [
        {
          level: "INTERNSHIP_READY",
          requiredSkillCount: 3,
          optionalSkillCount: 1,
          estimatedHoursP50: 80,
          topSkills: ["SQL"],
        },
      ],
    } as CareerRoleOption;
    expect(roleLevel(role, "INTERNSHIP_READY")?.estimatedHoursP50).toBe(80);
    expect(roleLevel(role, "PRODUCT_PLACEMENT")).toBeUndefined();
  });

  it("formats canonical target values consistently", () => {
    expect(formatTargetLevel("PRODUCT_PLACEMENT")).toBe("Product Placement");
  });
});
