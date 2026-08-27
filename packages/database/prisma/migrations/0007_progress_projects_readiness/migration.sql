-- Phase 7: reviewed project templates, artifact evidence, progress snapshots, and preparation readiness.
CREATE TYPE "StudentProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');
CREATE TYPE "ProjectMilestoneProgressStatus" AS ENUM ('PLANNED', 'SUBMITTED', 'COMPLETED');

CREATE TABLE "project_datasets" (
  "id" UUID NOT NULL,
  "career_dataset_id" UUID NOT NULL,
  "source_import_id" UUID NOT NULL,
  "dataset_version" VARCHAR(32) NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "synthetic" BOOLEAN NOT NULL DEFAULT false,
  "editor_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "review_rationale" VARCHAR(2000) NOT NULL,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_templates" (
  "id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "goal" VARCHAR(1000) NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "hours_p25" DECIMAL(8,2) NOT NULL,
  "hours_p50" DECIMAL(8,2) NOT NULL,
  "hours_p75" DECIMAL(8,2) NOT NULL,
  "portfolio_value" DECIMAL(4,3) NOT NULL,
  "deliverables" JSONB NOT NULL,
  "deployment_required" BOOLEAN NOT NULL,
  CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_templates_version_check" CHECK ("version" >= 1),
  CONSTRAINT "project_templates_hours_check" CHECK ("hours_p25" > 0 AND "hours_p25" <= "hours_p50" AND "hours_p50" <= "hours_p75"),
  CONSTRAINT "project_templates_portfolio_check" CHECK ("portfolio_value" BETWEEN 0 AND 1)
);

CREATE TABLE "project_role_fits" (
  "project_id" UUID NOT NULL,
  "role_version_id" UUID NOT NULL,
  "fit" DECIMAL(4,3) NOT NULL,
  CONSTRAINT "project_role_fits_pkey" PRIMARY KEY ("project_id", "role_version_id"),
  CONSTRAINT "project_role_fits_fit_check" CHECK ("fit" BETWEEN 0 AND 1)
);

CREATE TABLE "project_prerequisites" (
  "project_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "threshold" DECIMAL(4,3) NOT NULL,
  "type" "PrerequisiteType" NOT NULL,
  CONSTRAINT "project_prerequisites_pkey" PRIMARY KEY ("project_id", "skill_id"),
  CONSTRAINT "project_prerequisites_threshold_check" CHECK ("threshold" BETWEEN 0 AND 1)
);

CREATE TABLE "project_milestone_templates" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "weight" DECIMAL(5,4) NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "completion_criteria" JSONB NOT NULL,
  CONSTRAINT "project_milestone_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_milestone_templates_sequence_check" CHECK ("sequence" BETWEEN 1 AND 100),
  CONSTRAINT "project_milestone_templates_weight_check" CHECK ("weight" > 0 AND "weight" <= 1),
  CONSTRAINT "project_milestone_templates_minutes_check" CHECK ("estimated_minutes" BETWEEN 15 AND 12000)
);

CREATE TABLE "project_milestone_skills" (
  "milestone_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  CONSTRAINT "project_milestone_skills_pkey" PRIMARY KEY ("milestone_id", "skill_id")
);

CREATE TABLE "student_projects" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "status" "StudentProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_milestone_progress" (
  "id" UUID NOT NULL,
  "student_project_id" UUID NOT NULL,
  "milestone_id" UUID NOT NULL,
  "status" "ProjectMilestoneProgressStatus" NOT NULL DEFAULT 'PLANNED',
  "artifact_url" VARCHAR(2048),
  "submission_note" VARCHAR(1000),
  "submitted_at" TIMESTAMPTZ(3),
  "reviewer_id" UUID,
  "rubric_score" DECIMAL(4,3),
  "review_note" VARCHAR(1000),
  "reviewed_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "project_milestone_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_milestone_progress_rubric_check" CHECK ("rubric_score" IS NULL OR "rubric_score" BETWEEN 0 AND 1),
  CONSTRAINT "project_milestone_progress_submission_check" CHECK (("status" = 'PLANNED' AND "submitted_at" IS NULL) OR ("status" <> 'PLANNED' AND "submitted_at" IS NOT NULL)),
  CONSTRAINT "project_milestone_progress_review_check" CHECK (("status" = 'COMPLETED' AND "reviewer_id" IS NOT NULL AND "rubric_score" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "completed_at" IS NOT NULL) OR "status" <> 'COMPLETED')
);

CREATE TABLE "placement_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "resume_complete" BOOLEAN NOT NULL DEFAULT false,
  "profile_complete" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "placement_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "placement_metrics" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "role_version_id" UUID NOT NULL,
  "ruleset_version" VARCHAR(32) NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "score" DECIMAL(5,2) NOT NULL,
  "uncapped_score" DECIMAL(5,2) NOT NULL,
  "score_cap" INTEGER NOT NULL,
  "dimensions" JSONB NOT NULL,
  "gates" JSONB NOT NULL,
  "projection" JSONB NOT NULL,
  "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "placement_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "placement_metrics_score_check" CHECK ("score" BETWEEN 0 AND 100 AND "uncapped_score" BETWEEN 0 AND 100 AND "score_cap" IN (69, 79, 89, 100) AND "score" <= "score_cap")
);

CREATE TABLE "progress_snapshots" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "roadmap_revision_id" UUID NOT NULL,
  "period_type" VARCHAR(16) NOT NULL,
  "period_start" DATE NOT NULL,
  "metrics" JSONB NOT NULL,
  "algorithm_version" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "progress_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "progress_snapshots_period_check" CHECK ("period_type" IN ('DAY', 'WEEK', 'MONTH', 'ROLLING_7D', 'ROLLING_28D', 'ROLLING_90D'))
);

CREATE UNIQUE INDEX "project_datasets_source_import_id_key" ON "project_datasets"("source_import_id");
CREATE UNIQUE INDEX "project_datasets_dataset_version_key" ON "project_datasets"("dataset_version");
CREATE UNIQUE INDEX "project_datasets_one_published_idx" ON "project_datasets"((1)) WHERE "status" = 'PUBLISHED';
CREATE INDEX "project_datasets_status_published_at_idx" ON "project_datasets"("status", "published_at");
CREATE UNIQUE INDEX "project_templates_dataset_id_stable_key_version_key" ON "project_templates"("dataset_id", "stable_key", "version");
CREATE UNIQUE INDEX "project_milestone_templates_project_id_stable_key_key" ON "project_milestone_templates"("project_id", "stable_key");
CREATE UNIQUE INDEX "project_milestone_templates_project_id_sequence_key" ON "project_milestone_templates"("project_id", "sequence");
CREATE INDEX "student_projects_user_id_status_idx" ON "student_projects"("user_id", "status");
CREATE UNIQUE INDEX "student_projects_one_active_idx" ON "student_projects"("user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "project_milestone_progress_student_project_id_milestone_id_key" ON "project_milestone_progress"("student_project_id", "milestone_id");
CREATE INDEX "project_milestone_progress_status_submitted_at_idx" ON "project_milestone_progress"("status", "submitted_at");
CREATE UNIQUE INDEX "placement_profiles_user_id_key" ON "placement_profiles"("user_id");
CREATE UNIQUE INDEX "placement_metrics_user_id_input_hash_key" ON "placement_metrics"("user_id", "input_hash");
CREATE INDEX "placement_metrics_user_id_calculated_at_idx" ON "placement_metrics"("user_id", "calculated_at");
CREATE UNIQUE INDEX "progress_snapshots_user_period_revision_key" ON "progress_snapshots"("user_id", "period_type", "period_start", "roadmap_revision_id");

ALTER TABLE "project_datasets" ADD CONSTRAINT "project_datasets_career_dataset_id_fkey" FOREIGN KEY ("career_dataset_id") REFERENCES "career_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_datasets" ADD CONSTRAINT "project_datasets_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "content_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "project_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_role_fits" ADD CONSTRAINT "project_role_fits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_role_fits" ADD CONSTRAINT "project_role_fits_role_version_id_fkey" FOREIGN KEY ("role_version_id") REFERENCES "career_role_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_prerequisites" ADD CONSTRAINT "project_prerequisites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_prerequisites" ADD CONSTRAINT "project_prerequisites_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_templates" ADD CONSTRAINT "project_milestone_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_milestone_skills" ADD CONSTRAINT "project_milestone_skills_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "project_milestone_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_milestone_skills" ADD CONSTRAINT "project_milestone_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_projects" ADD CONSTRAINT "student_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_projects" ADD CONSTRAINT "student_projects_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress" ADD CONSTRAINT "project_milestone_progress_student_project_id_fkey" FOREIGN KEY ("student_project_id") REFERENCES "student_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress" ADD CONSTRAINT "project_milestone_progress_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "project_milestone_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_milestone_progress" ADD CONSTRAINT "project_milestone_progress_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "placement_profiles" ADD CONSTRAINT "placement_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "placement_metrics" ADD CONSTRAINT "placement_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "placement_metrics" ADD CONSTRAINT "placement_metrics_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "career_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "placement_metrics" ADD CONSTRAINT "placement_metrics_role_version_id_fkey" FOREIGN KEY ("role_version_id") REFERENCES "career_role_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_roadmap_revision_id_fkey" FOREIGN KEY ("roadmap_revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
