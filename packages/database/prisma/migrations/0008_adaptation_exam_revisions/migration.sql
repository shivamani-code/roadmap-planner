CREATE TYPE "WeeklyDifficulty" AS ENUM ('TOO_EASY', 'GOOD', 'TOO_DIFFICULT');
CREATE TYPE "ExamPeriodType" AS ENUM ('INTERNAL_EXAM', 'SEMESTER_EXAM', 'VACATION', 'PLACEMENT_WEEK');
CREATE TYPE "ExamPeriodProvenance" AS ENUM ('STUDENT', 'UNIVERSITY_TEMPLATE', 'COLLEGE_TEMPLATE');
CREATE TYPE "RevisionKind" AS ENUM ('WEEKLY', 'MATERIAL', 'ROLE', 'CONTENT', 'EXAM');

ALTER TABLE "roadmap_tasks" ADD COLUMN "retained_from_task_id" UUID;
ALTER TABLE "roadmap_tasks" ADD COLUMN "satisfied_by_completion_id" UUID;
ALTER TABLE "roadmap_revisions" ALTER COLUMN "gap_analysis_id" DROP NOT NULL;
ALTER TABLE "planning_weeks" ADD COLUMN "planning_mode" VARCHAR(32) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "planning_weeks" ADD COLUMN "mode_policy" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "roadmap_tasks_retained_from_task_id_idx" ON "roadmap_tasks"("retained_from_task_id");
CREATE INDEX "roadmap_tasks_satisfied_by_completion_id_idx" ON "roadmap_tasks"("satisfied_by_completion_id");
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_retained_from_task_id_fkey"
  FOREIGN KEY ("retained_from_task_id") REFERENCES "roadmap_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_satisfied_by_completion_id_fkey"
  FOREIGN KEY ("satisfied_by_completion_id") REFERENCES "task_completions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "weekly_reviews" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "planning_week_id" UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "difficulty" "WeeklyDifficulty" NOT NULL,
  "upcoming_changes" JSONB NOT NULL DEFAULT '[]',
  "planned_task_count" INTEGER NOT NULL,
  "completed_task_count" INTEGER NOT NULL,
  "planned_minutes" INTEGER NOT NULL,
  "completed_minutes" INTEGER NOT NULL,
  "actual_minutes" INTEGER NOT NULL,
  "completion_rate" DECIMAL(6,4) NOT NULL,
  "minute_completion_rate" DECIMAL(6,4) NOT NULL,
  "duration_ratio" DECIMAL(6,4) NOT NULL,
  "early_finish" BOOLEAN NOT NULL DEFAULT false,
  "ewma" DECIMAL(6,4),
  "multiplier" DECIMAL(4,2) NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_reviews_count_check" CHECK (
    "planned_task_count" >= 0 AND "completed_task_count" >= 0 AND
    "planned_minutes" >= 0 AND "completed_minutes" >= 0 AND "actual_minutes" >= 0
  ),
  CONSTRAINT "weekly_reviews_rate_check" CHECK (
    "completion_rate" >= 0 AND "completion_rate" <= 1 AND
    "minute_completion_rate" >= 0 AND "minute_completion_rate" <= 1 AND
    "duration_ratio" >= 0 AND "ewma" >= 0 AND "ewma" <= 1.5 AND
    "multiplier" >= 0.8 AND "multiplier" <= 1.15
  )
);

CREATE UNIQUE INDEX "weekly_reviews_planning_week_id_key" ON "weekly_reviews"("planning_week_id");
CREATE UNIQUE INDEX "weekly_reviews_user_id_week_start_key" ON "weekly_reviews"("user_id", "week_start");
CREATE INDEX "weekly_reviews_user_id_submitted_at_idx" ON "weekly_reviews"("user_id", "submitted_at");

CREATE TABLE "exam_periods" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "ExamPeriodType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "provenance" "ExamPeriodProvenance" NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "source_reference" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "exam_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_periods_date_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "exam_periods_student_confirmation_check" CHECK (
    "provenance" <> 'STUDENT' OR "confirmed" = true
  )
);

CREATE UNIQUE INDEX "exam_periods_user_type_dates_title_key"
  ON "exam_periods"("user_id", "type", "start_date", "end_date", "title");
CREATE INDEX "exam_periods_user_id_start_date_end_date_idx"
  ON "exam_periods"("user_id", "start_date", "end_date");

CREATE TABLE "roadmap_revision_diffs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "kind" "RevisionKind" NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "consent_required" BOOLEAN NOT NULL,
  "auto_eligible" BOOLEAN NOT NULL,
  "hours_moved_percent" DECIMAL(6,2) NOT NULL,
  "milestone_date_changes" INTEGER NOT NULL,
  "retained" JSONB NOT NULL DEFAULT '[]',
  "changed" JSONB NOT NULL DEFAULT '[]',
  "new_tasks" JSONB NOT NULL DEFAULT '[]',
  "no_longer_required" JSONB NOT NULL DEFAULT '[]',
  "summary" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roadmap_revision_diffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_revision_diffs_change_check" CHECK (
    "hours_moved_percent" >= 0 AND "milestone_date_changes" >= 0
  ),
  CONSTRAINT "roadmap_revision_diffs_consent_check" CHECK (
    NOT ("consent_required" AND "auto_eligible")
  ),
  CONSTRAINT "roadmap_revision_diffs_decision_check" CHECK (
    "accepted_at" IS NULL OR "rejected_at" IS NULL
  )
);

CREATE UNIQUE INDEX "roadmap_revision_diffs_revision_id_key" ON "roadmap_revision_diffs"("revision_id");
CREATE INDEX "roadmap_revision_diffs_user_id_created_at_idx" ON "roadmap_revision_diffs"("user_id", "created_at");
CREATE UNIQUE INDEX "roadmap_revisions_one_open_draft_key"
  ON "roadmap_revisions"("roadmap_id") WHERE "status" IN ('DRAFT', 'READY');

ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_planning_week_id_fkey"
  FOREIGN KEY ("planning_week_id") REFERENCES "planning_weeks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_revision_diffs" ADD CONSTRAINT "roadmap_revision_diffs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_revision_diffs" ADD CONSTRAINT "roadmap_revision_diffs_revision_id_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
