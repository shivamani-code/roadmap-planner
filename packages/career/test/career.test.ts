import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionCareerIssues,
  validateCareerKnowledge,
  type CareerKnowledgeImport,
} from "../src/index.js";

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../content/fixtures/career-knowledge.synthetic.valid.json",
    ),
    "utf8",
  ),
) as CareerKnowledgeImport;

describe("career graph validation", () => {
  it("validates structure while exposing incomplete learning-unit coverage", () => {
    const result = validateCareerKnowledge(fixture);
    expect(result.valid).toBe(true);
    expect(result.publishable).toBe(false);
    expect(result.coverageGaps).toContain("backend.framework");
  });

  it("rejects missing prerequisite references", () => {
    const changed = structuredClone(fixture);
    changed.skills[0]!.prerequisites.push({
      skillKey: "missing.skill",
      type: "HARD",
      threshold: 0.4,
    });
    expect(
      validateCareerKnowledge(changed).issues.some(
        ({ code }) => code === "MISSING_REFERENCE",
      ),
    ).toBe(true);
  });

  it("rejects prerequisite cycles and inverted effort ranges", () => {
    const changed = structuredClone(fixture);
    changed.skills[0]!.prerequisites.push({
      skillKey: "programming.oop",
      type: "HARD",
      threshold: 0.4,
    });
    changed.roles[0]!.targetLevels[0]!.requirements[0]!.hours = {
      p25: 50,
      p50: 20,
      p75: 10,
    };
    const codes = validateCareerKnowledge(changed).issues.map(
      ({ code }) => code,
    );
    expect(codes).toContain("PREREQUISITE_CYCLE");
    expect(codes).toContain("INVALID_RANGE");
  });

  it("keeps synthetic and fewer-than-four-role data outside production", () => {
    const issues = productionCareerIssues(validateCareerKnowledge(fixture));
    expect(issues).toHaveLength(
      2 + validateCareerKnowledge(fixture).coverageGaps.length,
    );
  });
});
