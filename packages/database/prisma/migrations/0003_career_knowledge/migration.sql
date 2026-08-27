-- Phase 3: reviewed career knowledge graph and versioned student goals.
CREATE TYPE "SkillCategory" AS ENUM ('PROGRAMMING', 'DSA', 'CORE_CS', 'DEVELOPMENT', 'DATABASES', 'TOOLS', 'DATA', 'PROJECTS', 'APTITUDE', 'COMMUNICATION', 'RESUME', 'INTERVIEW');
CREATE TYPE "PrerequisiteType" AS ENUM ('HARD', 'SOFT');
CREATE TYPE "TargetLevel" AS ENUM ('INTERNSHIP_READY', 'SERVICE_PLACEMENT', 'PRODUCT_PLACEMENT');
CREATE TYPE "LearningUnitType" AS ENUM ('TEACH', 'PRACTICE', 'ASSESS', 'REVISE');
CREATE TYPE "Difficulty" AS ENUM ('FOUNDATION', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "CareerGoalStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'ARCHIVED');

ALTER TABLE "content_imports" ADD COLUMN "career_dataset_id" UUID;

CREATE TABLE "career_datasets" (
  "id" UUID NOT NULL,
  "dataset_version" VARCHAR(32) NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "synthetic" BOOLEAN NOT NULL DEFAULT false,
  "editor_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "review_rationale" VARCHAR(2000) NOT NULL,
  "reviewed_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "career_datasets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_datasets_review_separation_check" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "editor_id")
);

CREATE TABLE "skills" (
  "id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" "SkillCategory" NOT NULL,
  "rubric_version" INTEGER NOT NULL,
  "evidence_decay_days" INTEGER,
  CONSTRAINT "skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skills_rubric_version_check" CHECK ("rubric_version" >= 1),
  CONSTRAINT "skills_decay_check" CHECK ("evidence_decay_days" IS NULL OR "evidence_decay_days" BETWEEN 30 AND 3650)
);

CREATE TABLE "skill_prerequisites" (
  "skill_id" UUID NOT NULL,
  "prerequisite_id" UUID NOT NULL,
  "type" "PrerequisiteType" NOT NULL,
  "threshold" DECIMAL(4,3) NOT NULL,
  CONSTRAINT "skill_prerequisites_pkey" PRIMARY KEY ("skill_id", "prerequisite_id"),
  CONSTRAINT "skill_prerequisites_not_self_check" CHECK ("skill_id" <> "prerequisite_id"),
  CONSTRAINT "skill_prerequisites_threshold_check" CHECK ("threshold" BETWEEN 0 AND 1)
);

CREATE TABLE "career_domains" (
  "id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  CONSTRAINT "career_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_role_versions" (
  "id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "domain_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL,
  CONSTRAINT "career_role_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_role_versions_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "role_skill_requirements" (
  "id" UUID NOT NULL,
  "role_version_id" UUID NOT NULL,
  "target_level" "TargetLevel" NOT NULL,
  "skill_id" UUID NOT NULL,
  "required_depth" DECIMAL(4,3) NOT NULL,
  "importance" DECIMAL(4,3) NOT NULL,
  "placement_relevance" DECIMAL(4,3) NOT NULL,
  "required" BOOLEAN NOT NULL,
  "required_by_days_before_deadline" INTEGER NOT NULL,
  "hours_p25" DECIMAL(8,2) NOT NULL,
  "hours_p50" DECIMAL(8,2) NOT NULL,
  "hours_p75" DECIMAL(8,2) NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  CONSTRAINT "role_skill_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_skill_requirements_depth_check" CHECK ("required_depth" BETWEEN 0 AND 1),
  CONSTRAINT "role_skill_requirements_importance_check" CHECK ("importance" BETWEEN 0 AND 1),
  CONSTRAINT "role_skill_requirements_placement_check" CHECK ("placement_relevance" BETWEEN 0 AND 1),
  CONSTRAINT "role_skill_requirements_offset_check" CHECK ("required_by_days_before_deadline" BETWEEN 0 AND 1460),
  CONSTRAINT "role_skill_requirements_effort_check" CHECK ("hours_p25" >= 0 AND "hours_p25" <= "hours_p50" AND "hours_p50" <= "hours_p75" AND "hours_p75" <= 2000)
);

CREATE TABLE "learning_unit_templates" (
  "id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "type" "LearningUnitType" NOT NULL,
  "from_depth" DECIMAL(4,3) NOT NULL,
  "to_depth" DECIMAL(4,3) NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "split_points" JSONB NOT NULL,
  "reason_codes" JSONB NOT NULL,
  CONSTRAINT "learning_unit_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "learning_unit_templates_depth_check" CHECK ("from_depth" BETWEEN 0 AND 1 AND "to_depth" BETWEEN 0 AND 1 AND "to_depth" >= "from_depth"),
  CONSTRAINT "learning_unit_templates_minutes_check" CHECK ("estimated_minutes" BETWEEN 5 AND 12000)
);

CREATE TABLE "learning_unit_skills" (
  "learning_unit_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  CONSTRAINT "learning_unit_skills_pkey" PRIMARY KEY ("learning_unit_id", "skill_id")
);

CREATE TABLE "career_goals" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "dataset_id" UUID NOT NULL,
  "role_version_id" UUID NOT NULL,
  "target_level" "TargetLevel" NOT NULL,
  "deadline" DATE NOT NULL,
  "deadline_basis" VARCHAR(64) NOT NULL,
  "status" "CareerGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "career_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_goal_versions" (
  "id" UUID NOT NULL,
  "goal_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "role_version_id" UUID NOT NULL,
  "target_level" "TargetLevel" NOT NULL,
  "deadline" DATE NOT NULL,
  "deadline_basis" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_goal_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "career_datasets_dataset_version_key" ON "career_datasets"("dataset_version");
CREATE INDEX "career_datasets_status_synthetic_published_idx" ON "career_datasets"("status", "synthetic", "published_at");
CREATE UNIQUE INDEX "career_datasets_one_published_key" ON "career_datasets"((true)) WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX "skills_dataset_id_stable_key_key" ON "skills"("dataset_id", "stable_key");
CREATE INDEX "skills_category_stable_key_idx" ON "skills"("category", "stable_key");
CREATE UNIQUE INDEX "career_domains_dataset_id_stable_key_key" ON "career_domains"("dataset_id", "stable_key");
CREATE UNIQUE INDEX "career_role_versions_dataset_key_version_key" ON "career_role_versions"("dataset_id", "stable_key", "version");
CREATE INDEX "career_role_versions_stable_key_version_idx" ON "career_role_versions"("stable_key", "version");
CREATE UNIQUE INDEX "role_skill_requirements_role_level_skill_key" ON "role_skill_requirements"("role_version_id", "target_level", "skill_id");
CREATE INDEX "role_skill_requirements_skill_level_idx" ON "role_skill_requirements"("skill_id", "target_level");
CREATE UNIQUE INDEX "learning_unit_templates_dataset_key_key" ON "learning_unit_templates"("dataset_id", "stable_key");
CREATE INDEX "career_goals_user_id_status_idx" ON "career_goals"("user_id", "status");
CREATE UNIQUE INDEX "career_goals_one_active_user_key" ON "career_goals"("user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "career_goal_versions_goal_id_version_key" ON "career_goal_versions"("goal_id", "version");

ALTER TABLE "skills" ADD CONSTRAINT "skills_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "career_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_domains" ADD CONSTRAINT "career_domains_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "career_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_role_versions" ADD CONSTRAINT "career_role_versions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "career_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_role_versions" ADD CONSTRAINT "career_role_versions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "career_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_skill_requirements" ADD CONSTRAINT "role_skill_requirements_role_version_id_fkey" FOREIGN KEY ("role_version_id") REFERENCES "career_role_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_skill_requirements" ADD CONSTRAINT "role_skill_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_unit_templates" ADD CONSTRAINT "learning_unit_templates_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "career_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_unit_skills" ADD CONSTRAINT "learning_unit_skills_learning_unit_id_fkey" FOREIGN KEY ("learning_unit_id") REFERENCES "learning_unit_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_unit_skills" ADD CONSTRAINT "learning_unit_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "career_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_role_version_id_fkey" FOREIGN KEY ("role_version_id") REFERENCES "career_role_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "career_goal_versions" ADD CONSTRAINT "career_goal_versions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "career_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_goal_versions" ADD CONSTRAINT "career_goal_versions_role_version_id_fkey" FOREIGN KEY ("role_version_id") REFERENCES "career_role_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_career_dataset_id_fkey" FOREIGN KEY ("career_dataset_id") REFERENCES "career_datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
