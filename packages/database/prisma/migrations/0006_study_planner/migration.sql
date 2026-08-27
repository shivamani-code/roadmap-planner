-- Phase 6: week/day capacity plans, task intents, occurrences, commands, and immutable completions.
CREATE TYPE "PlanningWeekStatus" AS ENUM ('ACTIVE', 'LOCKED', 'SUPERSEDED');
CREATE TYPE "TaskOccurrenceStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'SKIPPED', 'RESCHEDULED');
CREATE TYPE "TaskSkipReason" AS ENUM ('NO_TIME', 'TOO_DIFFICULT', 'ALREADY_KNEW', 'NOT_RELEVANT', 'OTHER');

CREATE TABLE "planning_weeks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "availability_id" UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "raw_minutes" INTEGER NOT NULL,
  "allocatable_minutes" INTEGER NOT NULL,
  "scheduled_minutes" INTEGER NOT NULL,
  "catchup_minutes" INTEGER NOT NULL,
  "status" "PlanningWeekStatus" NOT NULL DEFAULT 'ACTIVE',
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "planning_weeks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "planning_weeks_minutes_check" CHECK ("raw_minutes" >= 0 AND "allocatable_minutes" >= 0 AND "scheduled_minutes" >= 0 AND "catchup_minutes" >= 0 AND "scheduled_minutes" <= "allocatable_minutes" AND "allocatable_minutes" + "catchup_minutes" = "raw_minutes"),
  CONSTRAINT "planning_weeks_lock_check" CHECK ("lock_version" >= 1)
);

CREATE TABLE "planning_days" (
  "id" UUID NOT NULL,
  "week_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "raw_minutes" INTEGER NOT NULL,
  "scheduled_minutes" INTEGER NOT NULL,
  CONSTRAINT "planning_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "planning_days_minutes_check" CHECK ("raw_minutes" >= 0 AND "scheduled_minutes" >= 0 AND "scheduled_minutes" <= "raw_minutes")
);

CREATE TABLE "roadmap_tasks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "revision_id" UUID NOT NULL,
  "milestone_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "track" "RoadmapTrack" NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "reason_codes" JSONB NOT NULL,
  "source_trace" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roadmap_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roadmap_tasks_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "roadmap_tasks_minutes_check" CHECK ("estimated_minutes" BETWEEN 1 AND 240)
);

CREATE TABLE "task_occurrences" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "week_id" UUID NOT NULL,
  "day_id" UUID NOT NULL,
  "original_occurrence_id" UUID,
  "scheduled_date" DATE NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "status" "TaskOccurrenceStatus" NOT NULL DEFAULT 'PLANNED',
  "partial_minutes" INTEGER NOT NULL DEFAULT 0,
  "skip_reason" "TaskSkipReason",
  "skip_note" VARCHAR(500),
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "task_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_occurrences_minutes_check" CHECK ("estimated_minutes" > 0 AND "partial_minutes" >= 0 AND "partial_minutes" <= "estimated_minutes"),
  CONSTRAINT "task_occurrences_time_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute" AND "end_minute" - "start_minute" = "estimated_minutes"),
  CONSTRAINT "task_occurrences_skip_check" CHECK (("status" = 'SKIPPED' AND "skip_reason" IS NOT NULL) OR ("status" <> 'SKIPPED' AND "skip_reason" IS NULL)),
  CONSTRAINT "task_occurrences_lock_check" CHECK ("lock_version" >= 1)
);

CREATE TABLE "task_command_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "occurrence_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "command" VARCHAR(32) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_command_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_completions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "occurrence_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "actual_minutes" INTEGER NOT NULL,
  "outcome" VARCHAR(500) NOT NULL,
  "artifact_url" VARCHAR(2048),
  "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_completions_minutes_check" CHECK ("actual_minutes" BETWEEN 0 AND 1440)
);

CREATE UNIQUE INDEX "planning_weeks_revision_id_week_start_key" ON "planning_weeks"("revision_id", "week_start");
CREATE INDEX "planning_weeks_user_id_week_start_status_idx" ON "planning_weeks"("user_id", "week_start", "status");
CREATE UNIQUE INDEX "planning_days_week_id_local_date_key" ON "planning_days"("week_id", "local_date");
CREATE UNIQUE INDEX "roadmap_tasks_milestone_id_sequence_key" ON "roadmap_tasks"("milestone_id", "sequence");
CREATE INDEX "roadmap_tasks_revision_id_sequence_idx" ON "roadmap_tasks"("revision_id", "sequence");
CREATE INDEX "roadmap_tasks_user_id_skill_id_idx" ON "roadmap_tasks"("user_id", "skill_id");
CREATE UNIQUE INDEX "task_occurrences_original_occurrence_id_key" ON "task_occurrences"("original_occurrence_id");
CREATE UNIQUE INDEX "task_occurrences_task_id_scheduled_date_start_minute_key" ON "task_occurrences"("task_id", "scheduled_date", "start_minute");
CREATE INDEX "task_occurrences_user_id_scheduled_date_status_idx" ON "task_occurrences"("user_id", "scheduled_date", "status");
CREATE UNIQUE INDEX "task_command_records_user_id_idempotency_key_key" ON "task_command_records"("user_id", "idempotency_key");
CREATE INDEX "task_command_records_occurrence_id_created_at_idx" ON "task_command_records"("occurrence_id", "created_at");
CREATE UNIQUE INDEX "task_completions_occurrence_id_key" ON "task_completions"("occurrence_id");
CREATE UNIQUE INDEX "task_completions_user_id_idempotency_key_key" ON "task_completions"("user_id", "idempotency_key");

ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "study_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_days" ADD CONSTRAINT "planning_days_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "planning_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "roadmap_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "roadmap_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "roadmap_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "planning_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "planning_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_original_occurrence_id_fkey" FOREIGN KEY ("original_occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_command_records" ADD CONSTRAINT "task_command_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_command_records" ADD CONSTRAINT "task_command_records_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
