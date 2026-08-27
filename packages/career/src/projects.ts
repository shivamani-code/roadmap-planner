import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";

export interface ProjectTemplateImport {
  schemaVersion: "1.0.0";
  datasetVersion: string;
  synthetic: boolean;
  projects: Array<{
    key: string;
    version: number;
    title: string;
    goal: string;
    roleKeys: string[];
    difficulty: "FOUNDATION" | "INTERMEDIATE" | "ADVANCED";
    estimatedHours: { p25: number; p50: number; p75: number };
    portfolioValue: number;
    prerequisites: Array<{
      skillKey: string;
      threshold: number;
      type: "HARD" | "SOFT";
    }>;
    deliverables: string[];
    deploymentRequired: boolean;
    milestones: Array<{
      key: string;
      title: string;
      sequence: number;
      weight: number;
      estimatedMinutes: number;
      skillOutcomes: string[];
      completionCriteria: string[];
    }>;
  }>;
}

export interface ProjectValidationIssue {
  code: "SCHEMA_INVALID" | "DUPLICATE_KEY" | "INVALID_RANGE";
  path: string;
  message: string;
}

export interface ProjectValidationResult {
  valid: boolean;
  issues: ProjectValidationIssue[];
  data?: ProjectTemplateImport;
  statistics: { projects: number; milestones: number };
}

const schemaPath = path.resolve(
  import.meta.dirname,
  "../../../content/schemas/project-template.schema.json",
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile<ProjectTemplateImport>(schema);

function schemaIssue(error: ErrorObject): ProjectValidationIssue {
  return {
    code: "SCHEMA_INVALID",
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed",
  };
}

export function validateProjectTemplates(
  input: unknown,
): ProjectValidationResult {
  if (!validateSchema(input))
    return {
      valid: false,
      issues: (validateSchema.errors ?? []).map(schemaIssue),
      statistics: { projects: 0, milestones: 0 },
    };
  const data = input as ProjectTemplateImport;
  const issues: ProjectValidationIssue[] = [];
  const projectKeys = new Set<string>();
  for (const [projectIndex, project] of data.projects.entries()) {
    if (projectKeys.has(project.key))
      issues.push({
        code: "DUPLICATE_KEY",
        path: `/projects/${projectIndex}/key`,
        message: `Duplicate project key: ${project.key}`,
      });
    projectKeys.add(project.key);
    if (
      project.estimatedHours.p25 > project.estimatedHours.p50 ||
      project.estimatedHours.p50 > project.estimatedHours.p75
    )
      issues.push({
        code: "INVALID_RANGE",
        path: `/projects/${projectIndex}/estimatedHours`,
        message: "Effort percentiles must satisfy p25 <= p50 <= p75",
      });
    const milestoneKeys = new Set<string>();
    const sequences = new Set<number>();
    for (const [milestoneIndex, milestone] of project.milestones.entries()) {
      if (milestoneKeys.has(milestone.key))
        issues.push({
          code: "DUPLICATE_KEY",
          path: `/projects/${projectIndex}/milestones/${milestoneIndex}/key`,
          message: `Duplicate milestone key: ${milestone.key}`,
        });
      milestoneKeys.add(milestone.key);
      if (sequences.has(milestone.sequence))
        issues.push({
          code: "DUPLICATE_KEY",
          path: `/projects/${projectIndex}/milestones/${milestoneIndex}/sequence`,
          message: `Duplicate milestone sequence: ${milestone.sequence}`,
        });
      sequences.add(milestone.sequence);
    }
    const totalWeight = project.milestones.reduce(
      (total, milestone) => total + milestone.weight,
      0,
    );
    if (Math.abs(totalWeight - 1) > 0.001)
      issues.push({
        code: "INVALID_RANGE",
        path: `/projects/${projectIndex}/milestones`,
        message: "Milestone weights must sum to 1",
      });
  }
  return {
    valid: issues.length === 0,
    issues,
    ...(issues.length === 0 ? { data } : {}),
    statistics: {
      projects: data.projects.length,
      milestones: data.projects.reduce(
        (total, project) => total + project.milestones.length,
        0,
      ),
    },
  };
}
