-- Phase 4: assessment evidence, curriculum mappings, availability, and frozen gap analyses.
CREATE TYPE "AssessmentStatus" AS ENUM ('OPEN', 'SUBMITTED', 'SCORED');
CREATE TYPE "EvidenceSource" AS ENUM ('SELF_REPORT', 'COURSE_COMPLETION', 'EXERCISE', 'DIAGNOSTIC', 'TASK_COMPLETION', 'PROJECT_MILESTONE', 'MOCK_INTERVIEW');
CREATE TYPE "GapClassification" AS ENUM ('MASTERED', 'COLLEGE_COVERED', 'EXTENSION', 'INDEPENDENT', 'CAREER_ONLY', 'DEFERRED', 'UNKNOWN');
CREATE TYPE "GapAnalysisStatus" AS ENUM ('READY', 'INSUFFICIENT_CAPACITY', 'UNSUPPORTED');

CREATE TABLE "skill_assessments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "schema_version" VARCHAR(32) NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'OPEN',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMPTZ(3),
  "scored_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_responses" (
  "id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "raw_level" VARCHAR(32) NOT NULL,
  "normalized_value" DECIMAL(4,3),
  "confidence" DECIMAL(4,3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_responses_value_check" CHECK ("normalized_value" IS NULL OR "normalized_value" BETWEEN 0 AND 1),
  CONSTRAINT "assessment_responses_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1)
);

CREATE TABLE "skill_evidence" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "source_type" "EvidenceSource" NOT NULL,
  "source_id" VARCHAR(128) NOT NULL,
  "proficiency" DECIMAL(4,3) NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skill_evidence_proficiency_check" CHECK ("proficiency" BETWEEN 0 AND 1),
  CONSTRAINT "skill_evidence_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1)
);

CREATE TABLE "student_skills" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "proficiency" DECIMAL(4,3),
  "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
  "effective_proficiency" DECIMAL(4,3),
  "algorithm_version" VARCHAR(32) NOT NULL,
  "last_evidenced_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "student_skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_skills_proficiency_check" CHECK ("proficiency" IS NULL OR "proficiency" BETWEEN 0 AND 1),
  CONSTRAINT "student_skills_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
  CONSTRAINT "student_skills_effective_check" CHECK ("effective_proficiency" IS NULL OR "effective_proficiency" BETWEEN 0 AND 1)
);

CREATE TABLE "curriculum_skill_mappings" (
  "id" UUID NOT NULL,
  "curriculum_topic_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "breadth" DECIMAL(4,3) NOT NULL,
  "depth" DECIMAL(4,3) NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "practice_required" BOOLEAN NOT NULL,
  "evidence_potential" DECIMAL(4,3) NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  "version" INTEGER NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "curriculum_skill_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_skill_mappings_ratios_check" CHECK ("breadth" BETWEEN 0 AND 1 AND "depth" BETWEEN 0 AND 1 AND "confidence" BETWEEN 0 AND 1 AND "evidence_potential" BETWEEN 0 AND 1),
  CONSTRAINT "curriculum_skill_mappings_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "study_availability" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "weekly_minutes" INTEGER NOT NULL,
  "max_session_minutes" INTEGER NOT NULL,
  "day_windows" JSONB NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_availability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "study_availability_weekly_check" CHECK ("weekly_minutes" BETWEEN 1 AND 10080),
  CONSTRAINT "study_availability_session_check" CHECK ("max_session_minutes" BETWEEN 10 AND 240),
  CONSTRAINT "study_availability_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);

CREATE TABLE "gap_analyses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "curriculum_program_id" UUID NOT NULL,
  "career_dataset_id" UUID NOT NULL,
  "assessment_id" UUID,
  "availability_id" UUID NOT NULL,
  "ruleset_version" VARCHAR(32) NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "status" "GapAnalysisStatus" NOT NULL,
  "current_contribution" DECIMAL(5,2) NOT NULL,
  "college_contribution" DECIMAL(5,2) NOT NULL,
  "independent_gap" DECIMAL(5,2) NOT NULL,
  "effort_p25_hours" DECIMAL(9,2) NOT NULL,
  "effort_p50_hours" DECIMAL(9,2) NOT NULL,
  "effort_p75_hours" DECIMAL(9,2) NOT NULL,
  "allocatable_minutes" INTEGER NOT NULL,
  "required_minutes" INTEGER NOT NULL,
  "deficit_minutes" INTEGER NOT NULL,
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gap_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gap_analyses_contribution_check" CHECK ("current_contribution" >= 0 AND "college_contribution" >= 0 AND "independent_gap" >= 0 AND ABS(("current_contribution" + "college_contribution" + "independent_gap") - 100) <= 0.11),
  CONSTRAINT "gap_analyses_minutes_check" CHECK ("allocatable_minutes" >= 0 AND "required_minutes" >= 0 AND "deficit_minutes" >= 0)
);

CREATE TABLE "gap_analysis_items" (
  "id" UUID NOT NULL,
  "analysis_id" UUID NOT NULL,
  "requirement_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "classification" "GapClassification" NOT NULL,
  "current_proficiency" DECIMAL(4,3),
  "evidence_confidence" DECIMAL(4,3) NOT NULL,
  "effective_proficiency" DECIMAL(4,3),
  "curriculum_depth" DECIMAL(4,3) NOT NULL,
  "mapping_confidence" DECIMAL(4,3) NOT NULL,
  "current_ratio" DECIMAL(5,4) NOT NULL,
  "college_ratio" DECIMAL(5,4) NOT NULL,
  "external_ratio" DECIMAL(5,4) NOT NULL,
  "effort_p25_hours" DECIMAL(9,2) NOT NULL,
  "effort_p50_hours" DECIMAL(9,2) NOT NULL,
  "effort_p75_hours" DECIMAL(9,2) NOT NULL,
  "reason_codes" JSONB NOT NULL,
  "trace" JSONB NOT NULL,
  CONSTRAINT "gap_analysis_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gap_analysis_items_ratios_check" CHECK ("evidence_confidence" BETWEEN 0 AND 1 AND "curriculum_depth" BETWEEN 0 AND 1 AND "mapping_confidence" BETWEEN 0 AND 1 AND "current_ratio" BETWEEN 0 AND 1 AND "college_ratio" BETWEEN 0 AND 1 AND "external_ratio" BETWEEN 0 AND 1)
);

CREATE INDEX "skill_assessments_user_id_status_idx" ON "skill_assessments"("user_id", "status");
CREATE UNIQUE INDEX "assessment_responses_assessment_id_skill_id_key" ON "assessment_responses"("assessment_id", "skill_id");
CREATE UNIQUE INDEX "skill_evidence_source_type_source_id_skill_id_key" ON "skill_evidence"("source_type", "source_id", "skill_id");
CREATE INDEX "skill_evidence_user_id_skill_id_occurred_at_idx" ON "skill_evidence"("user_id", "skill_id", "occurred_at");
CREATE UNIQUE INDEX "student_skills_user_id_skill_id_key" ON "student_skills"("user_id", "skill_id");
CREATE UNIQUE INDEX "curriculum_skill_mappings_topic_skill_version_key" ON "curriculum_skill_mappings"("curriculum_topic_id", "skill_id", "version");
CREATE INDEX "curriculum_skill_mappings_skill_confidence_idx" ON "curriculum_skill_mappings"("skill_id", "confidence");
CREATE UNIQUE INDEX "study_availability_user_id_effective_from_key" ON "study_availability"("user_id", "effective_from");
CREATE INDEX "study_availability_user_id_effective_to_idx" ON "study_availability"("user_id", "effective_to");
CREATE UNIQUE INDEX "gap_analyses_user_id_input_hash_key" ON "gap_analyses"("user_id", "input_hash");
CREATE INDEX "gap_analyses_user_id_created_at_idx" ON "gap_analyses"("user_id", "created_at");
CREATE UNIQUE INDEX "gap_analysis_items_analysis_id_requirement_id_key" ON "gap_analysis_items"("analysis_id", "requirement_id");

ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "career_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "skill_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_skill_mappings" ADD CONSTRAINT "curriculum_skill_mappings_curriculum_topic_id_fkey" FOREIGN KEY ("curriculum_topic_id") REFERENCES "curriculum_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_skill_mappings" ADD CONSTRAINT "curriculum_skill_mappings_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "study_availability" ADD CONSTRAINT "study_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "career_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_curriculum_program_id_fkey" FOREIGN KEY ("curriculum_program_id") REFERENCES "curriculum_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_career_dataset_id_fkey" FOREIGN KEY ("career_dataset_id") REFERENCES "career_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "skill_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "study_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analysis_items" ADD CONSTRAINT "gap_analysis_items_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "gap_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gap_analysis_items" ADD CONSTRAINT "gap_analysis_items_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "role_skill_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gap_analysis_items" ADD CONSTRAINT "gap_analysis_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
