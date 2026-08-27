-- Phase 5: versioned, prerequisite-safe roadmap persistence and generation jobs.
CREATE TYPE "RoadmapLifecycleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "RoadmapRevisionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'ACTIVE', 'SUPERSEDED', 'FAILED');
CREATE TYPE "RoadmapTrack" AS ENUM ('ACADEMIC', 'CAREER', 'PROJECT', 'PLACEMENT');
CREATE TYPE "RoadmapMilestoneStatus" AS ENUM ('PLANNED', 'LOCKED', 'COMPLETED', 'EXCLUDED');
CREATE TYPE "GenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "roadmaps" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "status" "RoadmapLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "active_revision_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roadmap_revisions" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "RoadmapRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "trigger" VARCHAR(64) NOT NULL,
  "gap_analysis_id" UUID NOT NULL,
  "availability_id" UUID NOT NULL,
  "curriculum_program_id" UUID NOT NULL,
  "career_dataset_id" UUID NOT NULL,
  "supersedes_id" UUID,
  "ruleset_version" VARCHAR(32) NOT NULL,
  "seed" VARCHAR(64) NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "input_snapshot" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "exclusions" JSONB NOT NULL DEFAULT '[]',
  "risks" JSONB NOT NULL DEFAULT '[]',
  "generated_at" TIMESTAMPTZ(3),
  "activated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roadmap_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_revisions_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "roadmap_terms" (
  "id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "semester_number" INTEGER,
  "label" VARCHAR(120) NOT NULL,
  "theme" VARCHAR(240) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "capacity_minutes" INTEGER NOT NULL,
  "planned_minutes" INTEGER NOT NULL,
  CONSTRAINT "roadmap_terms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_terms_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "roadmap_terms_semester_check" CHECK ("semester_number" IS NULL OR "semester_number" BETWEEN 1 AND 12),
  CONSTRAINT "roadmap_terms_dates_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "roadmap_terms_capacity_check" CHECK ("capacity_minutes" >= 0 AND "planned_minutes" >= 0 AND "planned_minutes" <= "capacity_minutes")
);

CREATE TABLE "roadmap_milestones" (
  "id" UUID NOT NULL,
  "term_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "learning_unit_template_id" UUID NOT NULL,
  "source_requirement_id" UUID,
  "stable_key" VARCHAR(200) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "track" "RoadmapTrack" NOT NULL,
  "status" "RoadmapMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
  "estimated_minutes" INTEGER NOT NULL,
  "priority" DECIMAL(6,3) NOT NULL,
  "required_by" DATE NOT NULL,
  "reason_codes" JSONB NOT NULL,
  "source_trace" JSONB NOT NULL,
  CONSTRAINT "roadmap_milestones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_milestones_minutes_check" CHECK ("estimated_minutes" > 0),
  CONSTRAINT "roadmap_milestones_priority_check" CHECK ("priority" BETWEEN 0 AND 100)
);

CREATE TABLE "roadmap_milestone_dependencies" (
  "milestone_id" UUID NOT NULL,
  "prerequisite_id" UUID NOT NULL,
  CONSTRAINT "roadmap_milestone_dependencies_pkey" PRIMARY KEY ("milestone_id", "prerequisite_id"),
  CONSTRAINT "roadmap_milestone_dependencies_no_self_check" CHECK ("milestone_id" <> "prerequisite_id")
);

CREATE TABLE "generation_jobs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "roadmap_id" UUID,
  "revision_id" UUID,
  "gap_analysis_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "status" "GenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" VARCHAR(32) NOT NULL DEFAULT 'VALIDATING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(80),
  "error_detail" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_jobs_attempt_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "roadmaps_goal_id_key" ON "roadmaps"("goal_id");
CREATE UNIQUE INDEX "roadmaps_active_revision_id_key" ON "roadmaps"("active_revision_id");
CREATE INDEX "roadmaps_user_id_status_idx" ON "roadmaps"("user_id", "status");
CREATE UNIQUE INDEX "roadmap_revisions_roadmap_id_version_key" ON "roadmap_revisions"("roadmap_id", "version");
CREATE UNIQUE INDEX "roadmap_revisions_roadmap_id_input_hash_key" ON "roadmap_revisions"("roadmap_id", "input_hash");
CREATE UNIQUE INDEX "roadmap_revisions_one_active_idx" ON "roadmap_revisions"("roadmap_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "roadmap_revisions_gap_analysis_id_idx" ON "roadmap_revisions"("gap_analysis_id");
CREATE UNIQUE INDEX "roadmap_terms_revision_id_sequence_key" ON "roadmap_terms"("revision_id", "sequence");
CREATE UNIQUE INDEX "roadmap_milestones_term_id_stable_key_key" ON "roadmap_milestones"("term_id", "stable_key");
CREATE INDEX "roadmap_milestones_skill_id_status_idx" ON "roadmap_milestones"("skill_id", "status");
CREATE UNIQUE INDEX "generation_jobs_user_id_idempotency_key_key" ON "generation_jobs"("user_id", "idempotency_key");
CREATE UNIQUE INDEX "generation_jobs_user_id_input_hash_key" ON "generation_jobs"("user_id", "input_hash");
CREATE INDEX "generation_jobs_status_created_at_idx" ON "generation_jobs"("status", "created_at");

ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "career_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_gap_analysis_id_fkey" FOREIGN KEY ("gap_analysis_id") REFERENCES "gap_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "study_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_curriculum_program_id_fkey" FOREIGN KEY ("curriculum_program_id") REFERENCES "curriculum_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_career_dataset_id_fkey" FOREIGN KEY ("career_dataset_id") REFERENCES "career_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_revisions" ADD CONSTRAINT "roadmap_revisions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "roadmap_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_terms" ADD CONSTRAINT "roadmap_terms_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "roadmap_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_learning_unit_template_id_fkey" FOREIGN KEY ("learning_unit_template_id") REFERENCES "learning_unit_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_source_requirement_id_fkey" FOREIGN KEY ("source_requirement_id") REFERENCES "role_skill_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestone_dependencies" ADD CONSTRAINT "roadmap_milestone_dependencies_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "roadmap_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_milestone_dependencies" ADD CONSTRAINT "roadmap_milestone_dependencies_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "roadmap_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_gap_analysis_id_fkey" FOREIGN KEY ("gap_analysis_id") REFERENCES "gap_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_active_revision_id_fkey" FOREIGN KEY ("active_revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
