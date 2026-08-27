import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateProjectTemplates } from "../src/projects.js";

const fixturePath = path.resolve(
  import.meta.dirname,
  "../../../content/fixtures/projects.synthetic.valid.json",
);

function fixture(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("project content validation", () => {
  it("accepts the canonical synthetic fixture", () => {
    const result = validateProjectTemplates(fixture());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.statistics).toEqual({ projects: 1, milestones: 4 });
  });

  it("returns schema issues instead of throwing on malformed input", () => {
    const result = validateProjectTemplates({ projects: [{ goal: null }] });
    expect(result.valid).toBe(false);
    expect(result.issues.every(({ code }) => code === "SCHEMA_INVALID")).toBe(
      true,
    );
  });

  it("rejects invalid effort ordering, duplicate sequence, and weight totals", () => {
    const value = fixture();
    const projects = value.projects as Array<{
      estimatedHours: { p25: number; p50: number; p75: number };
      milestones: Array<{ sequence: number; weight: number }>;
    }>;
    projects[0]!.estimatedHours = { p25: 60, p50: 40, p75: 50 };
    projects[0]!.milestones[1]!.sequence = 1;
    projects[0]!.milestones[0]!.weight = 0.1;
    const result = validateProjectTemplates(value);
    expect(result.valid).toBe(false);
    expect(result.issues.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("p25 <= p50 <= p75"),
        expect.stringContaining("Duplicate milestone sequence"),
        expect.stringContaining("weights must sum to 1"),
      ]),
    );
  });
});
