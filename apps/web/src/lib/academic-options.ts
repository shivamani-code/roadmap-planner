import type { AcademicOption } from "@studentos/contracts";

export interface AcademicSelection {
  universityId: string;
  regulationId: string;
  degreeId: string;
  branchId: string;
}

export function distinctById<T extends { id: string }>(
  values: readonly T[],
): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function dependentOptions(
  programs: readonly AcademicOption[],
  selection: Partial<AcademicSelection>,
) {
  const afterUniversity = selection.universityId
    ? programs.filter(
        ({ university }) => university.id === selection.universityId,
      )
    : programs;
  const afterRegulation = selection.regulationId
    ? afterUniversity.filter(
        ({ regulation }) => regulation.id === selection.regulationId,
      )
    : afterUniversity;
  const afterDegree = selection.degreeId
    ? afterRegulation.filter(({ degree }) => degree.id === selection.degreeId)
    : afterRegulation;
  return {
    universities: distinctById(programs.map(({ university }) => university)),
    regulations: distinctById(
      afterUniversity.map(({ regulation }) => regulation),
    ),
    degrees: distinctById(afterRegulation.map(({ degree }) => degree)),
    branches: distinctById(afterDegree.map(({ branch }) => branch)),
  };
}

export function selectedProgram(
  programs: readonly AcademicOption[],
  selection: AcademicSelection,
): AcademicOption | undefined {
  return programs.find(
    ({ university, regulation, degree, branch }) =>
      university.id === selection.universityId &&
      regulation.id === selection.regulationId &&
      degree.id === selection.degreeId &&
      branch.id === selection.branchId,
  );
}
