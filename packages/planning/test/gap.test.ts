import { describe, expect, it } from "vitest";
import {
  aggregateEvidence,
  analyzeGap,
  classifyRequirement,
  effectiveProficiency,
  type GapRequirementInput,
} from "../src/index.js";

const requirement = (
  overrides: Partial<GapRequirementInput> = {},
): GapRequirementInput => ({
  id: "requirement-1",
  skillId: "skill-1",
  requiredDepth: 0.8,
  importance: 1,
  required: true,
  hours: { p25: 10, p50: 20, p75: 30 },
  estimate: {
    proficiency: 0.4,
    confidence: 0.45,
    effectiveProficiency: effectiveProficiency(0.4, 0.45),
  },
  ...overrides,
});

describe("assessment and gap engine", () => {
  it("keeps unknown distinct from zero and confidence-adjusts evidence", () => {
    expect(effectiveProficiency(null, 1)).toBeNull();
    expect(effectiveProficiency(0.8, 0.45)).toBeCloseTo(0.668);
    expect(aggregateEvidence([])).toEqual({
      proficiency: null,
      confidence: 0,
      effectiveProficiency: null,
    });
  });

  it("does not allow a low-confidence mapping to remove required work", () => {
    const result = classifyRequirement(
      requirement({
        curriculum: {
          depth: 0.8,
          confidence: 0.64,
          availableBeforeRequiredBy: true,
          current: true,
          trace: "topic-1",
        },
      }),
    );
    expect(result.collegeRatio).toBe(0);
    expect(result.warnings).toContain("LOW_CONFIDENCE_MAPPING_IGNORED");
  });

  it("reconciles contribution to exactly 100.0 across randomized inputs", () => {
    let state = 17;
    const random = (): number => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    for (let run = 0; run < 1000; run += 1) {
      const requirements = Array.from({ length: 8 }, (_, index) =>
        requirement({
          id: `r-${index}`,
          skillId: `s-${index}`,
          requiredDepth: 0.2 + random() * 0.8,
          importance: 0.05 + random() * 0.95,
          estimate: {
            proficiency: random(),
            confidence: random(),
            effectiveProficiency: random(),
          },
          curriculum: {
            depth: random(),
            confidence: random(),
            availableBeforeRequiredBy: random() > 0.2,
            current: random() > 0.5,
            trace: `t-${index}`,
          },
        }),
      );
      const contribution = analyzeGap(requirements, {
        weeklyMinutes: 600,
        weeksUntilDeadline: 20,
      }).contribution;
      expect(
        contribution.current + contribution.college + contribution.independent,
      ).toBeCloseTo(100, 10);
      expect(
        Object.values(contribution).every(
          (value) => value >= 0 && value <= 100,
        ),
      ).toBe(true);
    }
  });

  it("returns an explicit capacity decision instead of an overbooked plan", () => {
    const result = analyzeGap(
      [requirement({ hours: { p25: 100, p50: 120, p75: 160 } })],
      {
        weeklyMinutes: 240,
        weeksUntilDeadline: 4,
      },
    );
    expect(result.feasibility.status).toBe("INSUFFICIENT_CAPACITY");
    expect(result.feasibility.deficitMinutes).toBeGreaterThan(0);
  });
});
