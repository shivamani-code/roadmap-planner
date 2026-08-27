import { describe, expect, it } from "vitest";
import {
  generateRoadmap,
  scoreRoadmapPriority,
  type RoadmapSkillInput,
  type RoadmapTermInput,
} from "../src/index.js";

const unit = (key: string) => ({
  id: `unit-${key}`,
  stableKey: key,
  title: "Reviewed learning unit",
  type: "TEACH" as const,
  estimatedMinutes: 120,
  fromDepth: 0,
  toDepth: 0.8,
  reasonCodes: ["REVIEWED_TEMPLATE"],
});

const skill = (
  id: string,
  overrides: Partial<RoadmapSkillInput> = {},
): RoadmapSkillInput => ({
  skillId: id,
  stableKey: id,
  name: id,
  required: true,
  importance: 0.8,
  placementRelevance: 0.7,
  requiredDepth: 0.8,
  effectiveProficiency: 0.2,
  evidenceConfidence: 0.45,
  remainingMinutes: 120,
  requiredBy: "2027-12-31",
  deadlineUrgency: 0.5,
  academicSync: 0,
  studentWeakness: 0.6,
  roleRequirementId: `requirement-${id}`,
  prerequisites: [],
  learningUnits: [unit(id)],
  ...overrides,
});

const terms: RoadmapTermInput[] = [
  {
    id: "term-1",
    label: "Term 1",
    sequence: 1,
    semesterNumber: 3,
    startDate: "2027-01-01",
    endDate: "2027-06-30",
    capacityMinutes: 600,
  },
  {
    id: "term-2",
    label: "Term 2",
    sequence: 2,
    semesterNumber: 4,
    startDate: "2027-07-01",
    endDate: "2027-12-31",
    capacityMinutes: 600,
  },
];

describe("roadmap engine", () => {
  it("implements the specified bounded priority formula", () => {
    expect(
      scoreRoadmapPriority({
        roleImportance: 1,
        placementRelevance: 1,
        prerequisiteCentrality: 1,
        deadlineUrgency: 1,
        skillGap: 1,
        academicSync: 1,
        studentWeakness: 1,
        normalizedTimeCost: 1,
      }),
    ).toBe(88);
  });

  it("closes required hard prerequisites and never inverts them", () => {
    const result = generateRoadmap({
      rulesetVersion: "roadmap-1.0.0",
      terms,
      skills: [
        skill("foundation", { required: false }),
        skill("advanced", {
          prerequisites: [{ skillId: "foundation", type: "HARD" }],
        }),
        skill("optional", { required: false }),
      ],
    });
    expect(result.status).toBe("READY");
    expect(result.orderedSkillIds.indexOf("foundation")).toBeLessThan(
      result.orderedSkillIds.indexOf("advanced"),
    );
    expect(result.exclusions).toEqual([
      { skillId: "optional", reason: "OPTIONAL_OUTSIDE_REQUIRED_SUBGRAPH" },
    ]);
    expect(result.violations).toEqual([]);
  });

  it("is deterministic and respects capacity across generated DAGs", () => {
    let state = 29;
    const random = (): number => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    for (let run = 0; run < 1000; run += 1) {
      const skills = Array.from({ length: 8 }, (_, index) =>
        skill(`skill-${index}`, {
          importance: random(),
          remainingMinutes: 15 + Math.floor(random() * 45),
          prerequisites:
            index > 0 && random() > 0.45
              ? [
                  {
                    skillId: `skill-${Math.floor(random() * index)}`,
                    type: "HARD",
                  },
                ]
              : [],
        }),
      );
      const input = {
        rulesetVersion: "roadmap-1.0.0",
        terms: terms.map((term) => ({ ...term, capacityMinutes: 5000 })),
        skills,
      };
      const first = generateRoadmap(input);
      const second = generateRoadmap(input);
      expect(second).toEqual(first);
      expect(first.status).toBe("READY");
      expect(first.violations).toEqual([]);
    }
  });

  it("returns explicit risk and no overbooked term when required work cannot fit", () => {
    const result = generateRoadmap({
      rulesetVersion: "roadmap-1.0.0",
      terms: [{ ...terms[0]!, capacityMinutes: 60 }],
      skills: [skill("large", { remainingMinutes: 120 })],
    });
    expect(result.status).toBe("INSUFFICIENT_CAPACITY");
    expect(result.milestones).toEqual([]);
    expect(result.risks[0]).toMatchObject({
      skillId: "large",
      code: "REQUIRED_WORK_DOES_NOT_FIT",
    });
    expect(result.terms[0]!.plannedMinutes).toBe(0);
  });

  it("blocks unreviewed required work instead of inventing a unit", () => {
    const result = generateRoadmap({
      rulesetVersion: "roadmap-1.0.0",
      terms,
      skills: [skill("missing", { learningUnits: [] })],
    });
    expect(result.status).toBe("INVALID_CONTENT");
    expect(result.risks[0]?.code).toBe("MISSING_REVIEWED_LEARNING_UNIT");
  });

  it("removes mastered beginner work but retains a reviewed revision", () => {
    const result = generateRoadmap({
      rulesetVersion: "roadmap-1.0.0",
      terms,
      skills: [
        skill("mastered", {
          effectiveProficiency: 0.9,
          evidenceConfidence: 0.9,
          remainingMinutes: 0,
          learningUnits: [
            unit("beginner"),
            {
              ...unit("revision"),
              type: "REVISE",
              estimatedMinutes: 45,
            },
          ],
        }),
      ],
    });
    expect(result.status).toBe("READY");
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0]).toMatchObject({
      learningUnitId: "unit-revision",
      estimatedMinutes: 45,
    });
  });

  it("treats unknown as conservative work rather than mastery", () => {
    const result = generateRoadmap({
      rulesetVersion: "roadmap-1.0.0",
      terms,
      skills: [
        skill("unknown", {
          effectiveProficiency: null,
          evidenceConfidence: 0,
        }),
      ],
    });
    expect(result.status).toBe("READY");
    expect(result.milestones[0]?.estimatedMinutes).toBe(120);
  });

  it("rejects cycles and missing prerequisite references", () => {
    expect(() =>
      generateRoadmap({
        rulesetVersion: "roadmap-1.0.0",
        terms,
        skills: [
          skill("a", { prerequisites: [{ skillId: "missing", type: "HARD" }] }),
        ],
      }),
    ).toThrow("Missing hard prerequisite");
    expect(() =>
      generateRoadmap({
        rulesetVersion: "roadmap-1.0.0",
        terms,
        skills: [
          skill("a", { prerequisites: [{ skillId: "b", type: "HARD" }] }),
          skill("b", { prerequisites: [{ skillId: "a", type: "HARD" }] }),
        ],
      }),
    ).toThrow("cycle");
  });
});
