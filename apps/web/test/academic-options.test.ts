import { describe, expect, it } from "vitest";
import type { AcademicOption } from "@studentos/contracts";
import { dependentOptions, selectedProgram } from "../src/lib/academic-options";

const program = (
  programId: string,
  universityId: string,
  branchId: string,
): AcademicOption => ({
  programId,
  university: { id: universityId, code: universityId, name: universityId },
  regulation: { id: `${universityId}-reg`, code: "R25", title: "R25" },
  degree: { id: `${universityId}-degree`, code: "BTECH", name: "B.Tech" },
  branch: { id: branchId, code: branchId, name: branchId },
  datasetVersion: "2026.08.1",
  coverageStatus: "SUPPORTED",
  availableSemesters: [1, 2, 3, 4, 5, 6, 7, 8],
  synthetic: true,
});

describe("dependent academic selectors", () => {
  const programs = [
    program("p1", "u1", "cse"),
    program("p2", "u1", "ece"),
    program("p3", "u2", "cse"),
  ];

  it("limits downstream values to compatible combinations", () => {
    const options = dependentOptions(programs, {
      universityId: "u1",
      regulationId: "u1-reg",
      degreeId: "u1-degree",
    });
    expect(options.regulations.map(({ id }) => id)).toEqual(["u1-reg"]);
    expect(options.branches.map(({ id }) => id)).toEqual(["cse", "ece"]);
  });

  it("resolves only an exact published combination", () => {
    expect(
      selectedProgram(programs, {
        universityId: "u1",
        regulationId: "u1-reg",
        degreeId: "u1-degree",
        branchId: "ece",
      })?.programId,
    ).toBe("p2");
  });
});
