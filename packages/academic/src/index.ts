import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import addFormats, { type FormatsPlugin } from "ajv-formats";

export interface CurriculumSource {
  documentId: string;
  title: string;
  sourceUrl?: string;
  sha256: string;
  publishedAt?: string;
  retrievedAt: string;
  usagePermission?: "PUBLIC_OFFICIAL" | "LICENSED" | "PERMISSION_RECORDED";
}

export interface CurriculumTopicInput {
  key: string;
  title: string;
  sourcePage: number;
  academicDepth: number;
  estimatedAcademicHours: number;
  prerequisiteTopicKeys?: string[];
  lab?: boolean;
}

export interface CurriculumImport {
  schemaVersion: "1.0.0";
  dataset: {
    universityCode: string;
    regulationCode: string;
    degreeCode: string;
    branchCode: string;
    datasetVersion: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    source: CurriculumSource;
    synthetic: boolean;
  };
  semesters: Array<{
    number: number;
    academicYear: number;
    subjects: Array<{
      code: string;
      title: string;
      credits: number;
      type:
        "THEORY" | "LAB" | "INTEGRATED" | "PROJECT" | "SEMINAR" | "ELECTIVE";
      contactHoursPerWeek?: number;
      units: Array<{
        number: number;
        title: string;
        topics: CurriculumTopicInput[];
      }>;
    }>;
  }>;
}

export interface CurriculumValidationIssue {
  code:
    | "SCHEMA_INVALID"
    | "DUPLICATE_KEY"
    | "MISSING_REFERENCE"
    | "PREREQUISITE_CYCLE";
  path: string;
  message: string;
}

export interface CurriculumValidationResult {
  valid: boolean;
  issues: CurriculumValidationIssue[];
  coverageStatus: "SUPPORTED" | "PARTIAL";
  statistics: {
    semesters: number;
    subjects: number;
    units: number;
    topics: number;
  };
  data?: CurriculumImport;
}

const schemaPath = path.resolve(
  import.meta.dirname,
  "../../../content/schemas/curriculum-import.schema.json",
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
const applyFormats = addFormats as unknown as FormatsPlugin;
const ajv = new Ajv2020({ allErrors: true, strict: true });
applyFormats(ajv);
const validateSchema = ajv.compile<CurriculumImport>(schema);

function schemaIssue(error: ErrorObject): CurriculumValidationIssue {
  return {
    code: "SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed",
  };
}

function duplicateIssues(
  values: readonly { key: string; path: string }[],
): CurriculumValidationIssue[] {
  const seen = new Set<string>();
  const issues: CurriculumValidationIssue[] = [];
  for (const value of values) {
    if (seen.has(value.key)) {
      issues.push({
        code: "DUPLICATE_KEY",
        path: value.path,
        message: `Duplicate stable key: ${value.key}`,
      });
    }
    seen.add(value.key);
  }
  return issues;
}

function graphIssues(
  topics: readonly { topic: CurriculumTopicInput; path: string }[],
): CurriculumValidationIssue[] {
  const keys = new Set(topics.map(({ topic }) => topic.key));
  const adjacency = new Map(
    topics.map(({ topic }) => [topic.key, topic.prerequisiteTopicKeys ?? []]),
  );
  const issues: CurriculumValidationIssue[] = [];
  for (const { topic, path: topicPath } of topics) {
    for (const prerequisite of topic.prerequisiteTopicKeys ?? []) {
      if (!keys.has(prerequisite)) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `${topicPath}/prerequisiteTopicKeys`,
          message: `Unknown prerequisite topic: ${prerequisite}`,
        });
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (adjacency.get(key) ?? []).some(
      (dependency) => keys.has(dependency) && visit(dependency),
    );
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };
  for (const key of keys) {
    if (visit(key)) {
      issues.push({
        code: "PREREQUISITE_CYCLE",
        path: "/semesters",
        message: `Prerequisite cycle includes ${key}`,
      });
      break;
    }
  }
  return issues;
}

export function validateCurriculumImport(
  input: unknown,
): CurriculumValidationResult {
  if (!validateSchema(input)) {
    return {
      valid: false,
      issues: (validateSchema.errors ?? []).map(schemaIssue),
      coverageStatus: "PARTIAL",
      statistics: { semesters: 0, subjects: 0, units: 0, topics: 0 },
    };
  }
  const data = input as CurriculumImport;
  const topicEntries: Array<{ topic: CurriculumTopicInput; path: string }> = [];
  const subjects: Array<{ key: string; path: string }> = [];
  let units = 0;
  data.semesters.forEach((semester, semesterIndex) => {
    semester.subjects.forEach((subject, subjectIndex) => {
      subjects.push({
        key: subject.code,
        path: `/semesters/${semesterIndex}/subjects/${subjectIndex}/code`,
      });
      subject.units.forEach((unit, unitIndex) => {
        units += 1;
        unit.topics.forEach((topic, topicIndex) => {
          topicEntries.push({
            topic,
            path: `/semesters/${semesterIndex}/subjects/${subjectIndex}/units/${unitIndex}/topics/${topicIndex}`,
          });
        });
      });
    });
  });
  const issues = [
    ...duplicateIssues(
      data.semesters.map((semester, index) => ({
        key: String(semester.number),
        path: `/semesters/${index}/number`,
      })),
    ),
    ...duplicateIssues(subjects),
    ...duplicateIssues(
      topicEntries.map(({ topic, path: topicPath }) => ({
        key: topic.key,
        path: `${topicPath}/key`,
      })),
    ),
    ...graphIssues(topicEntries),
  ];
  const semesterNumbers = new Set(data.semesters.map(({ number }) => number));
  const coverageStatus = Array.from(
    { length: 8 },
    (_, index) => index + 1,
  ).every((number) => semesterNumbers.has(number))
    ? "SUPPORTED"
    : "PARTIAL";
  return {
    valid: issues.length === 0,
    issues,
    coverageStatus,
    statistics: {
      semesters: data.semesters.length,
      subjects: subjects.length,
      units,
      topics: topicEntries.length,
    },
    data,
  };
}

export function productionPublicationIssues(
  input: CurriculumImport,
): CurriculumValidationIssue[] {
  const issues: CurriculumValidationIssue[] = [];
  if (input.dataset.synthetic) {
    issues.push({
      code: "SCHEMA_INVALID",
      path: "/dataset/synthetic",
      message: "Synthetic datasets cannot be published in production",
    });
  }
  if (!input.dataset.source.usagePermission) {
    issues.push({
      code: "SCHEMA_INVALID",
      path: "/dataset/source/usagePermission",
      message: "Usage permission evidence is required",
    });
  }
  if (/^0{64}$/.test(input.dataset.source.sha256)) {
    issues.push({
      code: "SCHEMA_INVALID",
      path: "/dataset/source/sha256",
      message: "Placeholder source checksums cannot be published",
    });
  }
  return issues;
}
