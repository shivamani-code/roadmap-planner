import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import addFormats, { type FormatsPlugin } from "ajv-formats";

export * from "./projects.js";

export type TargetLevel =
  "INTERNSHIP_READY" | "SERVICE_PLACEMENT" | "PRODUCT_PLACEMENT";

export interface CareerKnowledgeImport {
  schemaVersion: "1.0.0";
  datasetVersion: string;
  synthetic: boolean;
  review: {
    editorId: string;
    reviewerId: string;
    reviewedAt: string;
    rationale: string;
  };
  skills: Array<{
    key: string;
    name: string;
    category:
      | "PROGRAMMING"
      | "DSA"
      | "CORE_CS"
      | "DEVELOPMENT"
      | "DATABASES"
      | "TOOLS"
      | "DATA"
      | "PROJECTS"
      | "APTITUDE"
      | "COMMUNICATION"
      | "RESUME"
      | "INTERVIEW";
    rubricVersion: number;
    evidenceDecayDays?: number | null;
    prerequisites: Array<{
      skillKey: string;
      type: "HARD" | "SOFT";
      threshold: number;
    }>;
  }>;
  roles: Array<{
    key: string;
    name: string;
    domainKey: string;
    version: number;
    targetLevels: Array<{
      level: TargetLevel;
      requirements: Array<{
        skillKey: string;
        requiredDepth: number;
        importance: number;
        placementRelevance: number;
        required: boolean;
        requiredByDaysBeforeDeadline: number;
        hours: { p25: number; p50: number; p75: number };
        rationale: string;
      }>;
    }>;
  }>;
  learningUnits: Array<{
    key: string;
    type: "TEACH" | "PRACTICE" | "ASSESS" | "REVISE";
    skillKeys: string[];
    fromDepth: number;
    toDepth: number;
    estimatedMinutes: number;
    difficulty: "FOUNDATION" | "INTERMEDIATE" | "ADVANCED";
    splitPointsMinutes: number[];
    reasonCodes: string[];
  }>;
}

export type CareerValidationCode =
  | "SCHEMA_INVALID"
  | "DUPLICATE_KEY"
  | "MISSING_REFERENCE"
  | "PREREQUISITE_CYCLE"
  | "INVALID_RANGE"
  | "REVIEW_SEPARATION_REQUIRED";

export interface CareerValidationIssue {
  code: CareerValidationCode;
  path: string;
  message: string;
}

export interface CareerValidationResult {
  valid: boolean;
  publishable: boolean;
  issues: CareerValidationIssue[];
  coverageGaps: string[];
  data?: CareerKnowledgeImport;
  statistics: {
    skills: number;
    roles: number;
    requirements: number;
    learningUnits: number;
  };
}

const schemaPath = path.resolve(
  import.meta.dirname,
  "../../../content/schemas/career-knowledge.schema.json",
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
const applyFormats = addFormats as unknown as FormatsPlugin;
const ajv = new Ajv2020({ allErrors: true, strict: true });
applyFormats(ajv);
const validateSchema = ajv.compile<CareerKnowledgeImport>(schema);

function issue(error: ErrorObject): CareerValidationIssue {
  return {
    code: "SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed",
  };
}

function duplicates(
  values: readonly { key: string; path: string }[],
): CareerValidationIssue[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (seen.has(value.key)) {
      return [
        {
          code: "DUPLICATE_KEY" as const,
          path: value.path,
          message: `Duplicate stable key: ${value.key}`,
        },
      ];
    }
    seen.add(value.key);
    return [];
  });
}

export function validateCareerKnowledge(
  input: unknown,
): CareerValidationResult {
  if (!validateSchema(input)) {
    return {
      valid: false,
      publishable: false,
      issues: (validateSchema.errors ?? []).map(issue),
      coverageGaps: [],
      statistics: { skills: 0, roles: 0, requirements: 0, learningUnits: 0 },
    };
  }
  const data = input as CareerKnowledgeImport;
  const issues: CareerValidationIssue[] = [
    ...duplicates(
      data.skills.map((skill, index) => ({
        key: skill.key,
        path: `/skills/${index}/key`,
      })),
    ),
    ...duplicates(
      data.roles.map((role, index) => ({
        key: role.key,
        path: `/roles/${index}/key`,
      })),
    ),
    ...duplicates(
      data.learningUnits.map((unit, index) => ({
        key: unit.key,
        path: `/learningUnits/${index}/key`,
      })),
    ),
  ];
  if (data.review.editorId === data.review.reviewerId) {
    issues.push({
      code: "REVIEW_SEPARATION_REQUIRED",
      path: "/review",
      message: "Career editor and reviewer must differ",
    });
  }
  const skillKeys = new Set(data.skills.map(({ key }) => key));
  const adjacency = new Map(
    data.skills.map(({ key, prerequisites }) => [
      key,
      prerequisites.map(({ skillKey }) => skillKey),
    ]),
  );
  data.skills.forEach((skill, index) => {
    skill.prerequisites.forEach(({ skillKey }) => {
      if (!skillKeys.has(skillKey)) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `/skills/${index}/prerequisites`,
          message: `Unknown skill prerequisite: ${skillKey}`,
        });
      }
    });
  });
  let requirementCount = 0;
  data.roles.forEach((role, roleIndex) => {
    role.targetLevels.forEach((level, levelIndex) => {
      issues.push(
        ...duplicates(
          level.requirements.map((requirement, index) => ({
            key: requirement.skillKey,
            path: `/roles/${roleIndex}/targetLevels/${levelIndex}/requirements/${index}/skillKey`,
          })),
        ),
      );
      level.requirements.forEach((requirement, index) => {
        requirementCount += 1;
        if (!skillKeys.has(requirement.skillKey)) {
          issues.push({
            code: "MISSING_REFERENCE",
            path: `/roles/${roleIndex}/targetLevels/${levelIndex}/requirements/${index}/skillKey`,
            message: `Unknown required skill: ${requirement.skillKey}`,
          });
        }
        if (!(
          requirement.hours.p25 <= requirement.hours.p50 &&
          requirement.hours.p50 <= requirement.hours.p75
        )) {
          issues.push({
            code: "INVALID_RANGE",
            path: `/roles/${roleIndex}/targetLevels/${levelIndex}/requirements/${index}/hours`,
            message: "Effort must satisfy p25 ≤ p50 ≤ p75",
          });
        }
      });
    });
  });
  data.learningUnits.forEach((unit, index) => {
    if (unit.toDepth < unit.fromDepth) {
      issues.push({
        code: "INVALID_RANGE",
        path: `/learningUnits/${index}`,
        message: "Learning-unit depth cannot decrease",
      });
    }
    unit.skillKeys.forEach((skillKey) => {
      if (!skillKeys.has(skillKey)) {
        issues.push({
          code: "MISSING_REFERENCE",
          path: `/learningUnits/${index}/skillKeys`,
          message: `Unknown learning-unit skill: ${skillKey}`,
        });
      }
    });
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (adjacency.get(key) ?? []).some(
      (dependency) => skillKeys.has(dependency) && visit(dependency),
    );
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };
  for (const key of skillKeys) {
    if (visit(key)) {
      issues.push({
        code: "PREREQUISITE_CYCLE",
        path: "/skills",
        message: `Skill prerequisite cycle includes ${key}`,
      });
      break;
    }
  }
  const coveredSkills = new Set(
    data.learningUnits.flatMap(({ skillKeys: keys }) => keys),
  );
  const requiredSkills = new Set(
    data.roles.flatMap(({ targetLevels }) =>
      targetLevels.flatMap(({ requirements }) =>
        requirements
          .filter(({ required }) => required)
          .map(({ skillKey }) => skillKey),
      ),
    ),
  );
  const coverageGaps = [...requiredSkills]
    .filter((key) => !coveredSkills.has(key))
    .sort();
  return {
    valid: issues.length === 0,
    publishable: issues.length === 0 && coverageGaps.length === 0,
    issues,
    coverageGaps,
    data,
    statistics: {
      skills: data.skills.length,
      roles: data.roles.length,
      requirements: requirementCount,
      learningUnits: data.learningUnits.length,
    },
  };
}

export function productionCareerIssues(
  result: CareerValidationResult,
): string[] {
  if (!result.data) return ["Career dataset is invalid"];
  return [
    ...(result.data.synthetic
      ? ["Synthetic career datasets cannot be published in production"]
      : []),
    ...(result.data.roles.length < 4
      ? ["At least four expert-reviewed MVP roles are required"]
      : []),
    ...result.coverageGaps.map(
      (key) => `Required skill has no learning unit: ${key}`,
    ),
  ];
}
