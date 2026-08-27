import { z } from "zod";

export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

export const problemErrorSchema = z.object({
  field: z.string().optional(),
  message: z.string().min(1),
});

export const problemDetailSchema = z.object({
  type: z.url(),
  title: z.string().min(1),
  status: z.int().min(400).max(599),
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  detail: z.string().min(1),
  instance: z.string().startsWith("/"),
  correlationId: z.string().min(1),
  errors: z.array(problemErrorSchema).optional(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;

export const serviceHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
  checks: z.record(z.string(), z.enum(["ok", "degraded", "unavailable"])),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const publicUserSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120).nullable(),
  locale: z.string().min(2).max(16),
  timezone: z.string().min(1).max(64),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const jobStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export type JobState = z.infer<typeof jobStateSchema>;

export const contentStateSchema = z.enum([
  "DRAFT",
  "VALIDATING",
  "IN_REVIEW",
  "PUBLISHED",
  "SUPERSEDED",
  "ARCHIVED",
]);
export type ContentState = z.infer<typeof contentStateSchema>;

export const coverageStatusSchema = z.enum([
  "SUPPORTED",
  "PARTIAL",
  "UNSUPPORTED",
]);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

export const academicOptionSchema = z.object({
  programId: uuidSchema,
  university: z.object({ id: uuidSchema, code: z.string(), name: z.string() }),
  regulation: z.object({ id: uuidSchema, code: z.string(), title: z.string() }),
  degree: z.object({ id: uuidSchema, code: z.string(), name: z.string() }),
  branch: z.object({ id: uuidSchema, code: z.string(), name: z.string() }),
  datasetVersion: z.string(),
  coverageStatus: coverageStatusSchema,
  availableSemesters: z.array(z.int().min(1).max(12)),
  synthetic: z.boolean(),
});
export type AcademicOption = z.infer<typeof academicOptionSchema>;

export const academicProfileResponseSchema = z.object({
  profileId: uuidSchema,
  lockVersion: z.int().positive(),
  curriculumProgramId: uuidSchema,
  coverageStatus: coverageStatusSchema,
  nextStep: z.enum(["CAREER_GOAL", "ACADEMIC"]),
});
export type AcademicProfileResponse = z.infer<
  typeof academicProfileResponseSchema
>;

export const targetLevelSchema = z.enum([
  "INTERNSHIP_READY",
  "SERVICE_PLACEMENT",
  "PRODUCT_PLACEMENT",
]);
export type TargetLevel = z.infer<typeof targetLevelSchema>;

export const careerRoleOptionSchema = z.object({
  roleVersionId: uuidSchema,
  datasetVersion: z.string(),
  domain: z.object({ id: uuidSchema, key: z.string(), name: z.string() }),
  role: z.object({
    key: z.string(),
    name: z.string(),
    version: z.int().positive(),
  }),
  targetLevels: z.array(
    z.object({
      level: targetLevelSchema,
      requiredSkillCount: z.int().nonnegative(),
      optionalSkillCount: z.int().nonnegative(),
      estimatedHoursP50: z.number().nonnegative(),
      topSkills: z.array(z.string()),
    }),
  ),
  synthetic: z.boolean(),
  relevance: z
    .object({
      score: z.number().min(0).max(100),
      matchedSkillCount: z.int().nonnegative(),
      totalSkillCount: z.int().nonnegative(),
      matchedSkills: z.array(z.string()),
      supportingSubjects: z.array(z.string()),
      band: z.enum(["STRONG", "RELATED", "EXPLORE"]),
      recommended: z.boolean(),
      explanation: z.string(),
    })
    .optional(),
});
export type CareerRoleOption = z.infer<typeof careerRoleOptionSchema>;

export const studentCareerCatalogSchema = z.object({
  branch: z.object({
    code: z.string(),
    name: z.string(),
    degree: z.string(),
    curriculumVersion: z.string(),
  }),
  recommendedCount: z.int().nonnegative(),
  totalCount: z.int().nonnegative(),
  roles: z.array(careerRoleOptionSchema),
});
export type StudentCareerCatalog = z.infer<typeof studentCareerCatalogSchema>;

export const careerGoalResponseSchema = z.object({
  goalId: uuidSchema,
  lockVersion: z.int().positive(),
  roleVersionId: uuidSchema,
  targetLevel: targetLevelSchema,
  nextStep: z.literal("ASSESSMENT"),
});
export type CareerGoalResponse = z.infer<typeof careerGoalResponseSchema>;

export const roadmapRevisionStateSchema = z.enum([
  "DRAFT",
  "VALIDATING",
  "FAILED",
  "READY",
  "ACTIVE",
  "SUPERSEDED",
  "COMPLETED",
  "PAUSED",
]);
export type RoadmapRevisionState = z.infer<typeof roadmapRevisionStateSchema>;

export const taskOccurrenceStateSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "PARTIAL",
  "RESCHEDULED",
  "SKIPPED",
  "COMPLETED",
]);
export type TaskOccurrenceState = z.infer<typeof taskOccurrenceStateSchema>;

export const reasonCodeSchema = z.enum([
  "ROLE_REQUIRED",
  "PLACEMENT_REQUIRED",
  "PREREQUISITE_OF",
  "ACADEMIC_SYNC",
  "ACADEMIC_EXTENSION",
  "CAREER_ONLY",
  "PROJECT_EVIDENCE",
  "LOW_CONFIDENCE_CHECK",
  "SPACED_REVISION",
  "DEADLINE_URGENCY",
  "EXAM_CONTINUITY",
  "OPTIONAL_EXCLUDED",
]);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export interface PageMeta {
  readonly nextCursor: string | null;
  readonly limit: number;
}

export interface Page<T> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}
