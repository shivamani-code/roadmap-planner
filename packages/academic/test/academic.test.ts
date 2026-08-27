import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionPublicationIssues,
  validateCurriculumImport,
  type CurriculumImport,
} from "../src/index.js";

const fixturePath = path.resolve(
  import.meta.dirname,
  "../../../content/fixtures/curriculum.synthetic.valid.json",
);
const fixture = JSON.parse(
  fs.readFileSync(fixturePath, "utf8"),
) as CurriculumImport;

describe("curriculum import validation", () => {
  it("validates the canonical JSON schema and computes partial coverage honestly", () => {
    const result = validateCurriculumImport(fixture);
    expect(result.valid).toBe(true);
    expect(result.coverageStatus).toBe("PARTIAL");
    expect(result.statistics).toEqual({
      semesters: 2,
      subjects: 2,
      units: 3,
      topics: 3,
    });
  });

  it("rejects missing topic references", () => {
    const changed = structuredClone(fixture);
    changed.semesters[0]!.subjects[0]!.units[0]!.topics[0]!.prerequisiteTopicKeys =
      ["missing.topic"];
    expect(
      validateCurriculumImport(changed).issues.some(
        ({ code }) => code === "MISSING_REFERENCE",
      ),
    ).toBe(true);
  });

  it("rejects curriculum prerequisite cycles", () => {
    const changed = structuredClone(fixture);
    changed.semesters[0]!.subjects[0]!.units[0]!.topics[0]!.prerequisiteTopicKeys =
      ["synthetic.dsa.trees"];
    expect(
      validateCurriculumImport(changed).issues.some(
        ({ code }) => code === "PREREQUISITE_CYCLE",
      ),
    ).toBe(true);
  });

  it("blocks synthetic and placeholder sources from production publication", () => {
    expect(
      productionPublicationIssues(fixture).map(
        ({ path: issuePath }) => issuePath,
      ),
    ).toEqual(["/dataset/synthetic", "/dataset/source/sha256"]);
  });
});
