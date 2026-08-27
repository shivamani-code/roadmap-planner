-- Phase 2: immutable curriculum catalog, reviewed imports, and versioned academic profiles.
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'VALIDATING', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');
CREATE TYPE "CoverageStatus" AS ENUM ('SUPPORTED', 'PARTIAL', 'UNSUPPORTED');
CREATE TYPE "SubjectType" AS ENUM ('THEORY', 'LAB', 'INTEGRATED', 'PROJECT', 'SEMINAR', 'ELECTIVE');
CREATE TYPE "OnboardingStatus" AS ENUM ('ACADEMIC', 'GOAL', 'ASSESSMENT', 'AVAILABILITY', 'REVIEW', 'COMPLETE');
CREATE TYPE "AdminRole" AS ENUM ('CONTENT_EDITOR', 'CONTENT_REVIEWER', 'SUPPORT', 'ANALYST', 'SUPER_ADMIN');

CREATE TABLE "admin_memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "AdminRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "admin_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "universities" (
  "id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regulations" (
  "id" UUID NOT NULL,
  "university_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "regulations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "degrees" (
  "id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "degrees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
  "id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_programs" (
  "id" UUID NOT NULL,
  "university_id" UUID NOT NULL,
  "regulation_id" UUID NOT NULL,
  "degree_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "dataset_version" VARCHAR(32) NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "coverage_status" "CoverageStatus" NOT NULL DEFAULT 'PARTIAL',
  "source_document_id" VARCHAR(128) NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_url" VARCHAR(2048),
  "source_checksum" CHAR(64) NOT NULL,
  "usage_permission" VARCHAR(64),
  "synthetic" BOOLEAN NOT NULL DEFAULT false,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "editor_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "curriculum_programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_programs_effective_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "curriculum_programs_review_separation_check" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "editor_id")
);

CREATE TABLE "curriculum_semesters" (
  "id" UUID NOT NULL,
  "program_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "academic_year" INTEGER NOT NULL,
  CONSTRAINT "curriculum_semesters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_semesters_number_check" CHECK ("number" BETWEEN 1 AND 12),
  CONSTRAINT "curriculum_semesters_year_check" CHECK ("academic_year" BETWEEN 1 AND 6)
);

CREATE TABLE "academic_subjects" (
  "id" UUID NOT NULL,
  "semester_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "credits" DECIMAL(5,2) NOT NULL,
  "type" "SubjectType" NOT NULL,
  "contact_hours_per_week" DECIMAL(5,2),
  CONSTRAINT "academic_subjects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_subjects_credits_check" CHECK ("credits" BETWEEN 0 AND 20),
  CONSTRAINT "academic_subjects_contact_hours_check" CHECK ("contact_hours_per_week" IS NULL OR "contact_hours_per_week" BETWEEN 0 AND 40)
);

CREATE TABLE "subject_units" (
  "id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  CONSTRAINT "subject_units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subject_units_number_check" CHECK ("number" BETWEEN 1 AND 30)
);

CREATE TABLE "curriculum_topics" (
  "id" UUID NOT NULL,
  "program_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "stable_key" VARCHAR(128) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "source_page" INTEGER NOT NULL,
  "academic_depth" DECIMAL(4,3) NOT NULL,
  "estimated_academic_hours" DECIMAL(7,2) NOT NULL,
  "lab" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "curriculum_topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "curriculum_topics_source_page_check" CHECK ("source_page" > 0),
  CONSTRAINT "curriculum_topics_depth_check" CHECK ("academic_depth" BETWEEN 0 AND 1),
  CONSTRAINT "curriculum_topics_hours_check" CHECK ("estimated_academic_hours" > 0 AND "estimated_academic_hours" <= 200)
);

CREATE TABLE "curriculum_topic_prerequisites" (
  "topic_id" UUID NOT NULL,
  "prerequisite_id" UUID NOT NULL,
  CONSTRAINT "curriculum_topic_prerequisites_pkey" PRIMARY KEY ("topic_id", "prerequisite_id"),
  CONSTRAINT "curriculum_topic_prerequisites_not_self_check" CHECK ("topic_id" <> "prerequisite_id")
);

CREATE TABLE "content_imports" (
  "id" UUID NOT NULL,
  "dataset_type" VARCHAR(64) NOT NULL,
  "dataset_version" VARCHAR(32),
  "source_checksum" CHAR(64),
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "editor_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "payload" JSONB NOT NULL,
  "program_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "content_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_imports_review_separation_check" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "editor_id")
);

CREATE TABLE "content_validation_results" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "path" VARCHAR(500) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "severity" VARCHAR(16) NOT NULL DEFAULT 'ERROR',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_validation_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "curriculum_program_id" UUID,
  "current_semester" INTEGER,
  "expected_graduation" DATE,
  "cgpa" DECIMAL(4,2),
  "backlog_count" INTEGER,
  "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'ACADEMIC',
  "lock_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_profiles_semester_check" CHECK ("current_semester" IS NULL OR "current_semester" BETWEEN 1 AND 12),
  CONSTRAINT "student_profiles_cgpa_check" CHECK ("cgpa" IS NULL OR "cgpa" BETWEEN 0 AND 10),
  CONSTRAINT "student_profiles_backlog_check" CHECK ("backlog_count" IS NULL OR "backlog_count" >= 0)
);

CREATE TABLE "academic_profile_versions" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "curriculum_program_id" UUID NOT NULL,
  "current_semester" INTEGER NOT NULL,
  "expected_graduation" DATE NOT NULL,
  "cgpa" DECIMAL(4,2),
  "backlog_count" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_profile_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_profile_versions_semester_check" CHECK ("current_semester" BETWEEN 1 AND 12),
  CONSTRAINT "academic_profile_versions_cgpa_check" CHECK ("cgpa" IS NULL OR "cgpa" BETWEEN 0 AND 10),
  CONSTRAINT "academic_profile_versions_backlog_check" CHECK ("backlog_count" IS NULL OR "backlog_count" >= 0)
);

CREATE UNIQUE INDEX "admin_memberships_user_id_key" ON "admin_memberships"("user_id");
CREATE UNIQUE INDEX "universities_code_key" ON "universities"("code");
CREATE UNIQUE INDEX "regulations_university_id_code_key" ON "regulations"("university_id", "code");
CREATE UNIQUE INDEX "degrees_code_key" ON "degrees"("code");
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");
CREATE UNIQUE INDEX "curriculum_programs_scope_version_key" ON "curriculum_programs"("university_id", "regulation_id", "degree_id", "branch_id", "dataset_version");
CREATE INDEX "curriculum_programs_status_synthetic_effective_idx" ON "curriculum_programs"("status", "synthetic", "effective_from");
CREATE UNIQUE INDEX "curriculum_programs_one_published_scope_key" ON "curriculum_programs"("university_id", "regulation_id", "degree_id", "branch_id") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX "curriculum_semesters_program_id_number_key" ON "curriculum_semesters"("program_id", "number");
CREATE UNIQUE INDEX "academic_subjects_semester_id_code_key" ON "academic_subjects"("semester_id", "code");
CREATE UNIQUE INDEX "subject_units_subject_id_number_key" ON "subject_units"("subject_id", "number");
CREATE UNIQUE INDEX "curriculum_topics_program_id_stable_key_key" ON "curriculum_topics"("program_id", "stable_key");
CREATE INDEX "content_imports_dataset_type_status_created_at_idx" ON "content_imports"("dataset_type", "status", "created_at");
CREATE INDEX "content_validation_results_import_id_severity_idx" ON "content_validation_results"("import_id", "severity");
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id");
CREATE INDEX "student_profiles_curriculum_program_id_idx" ON "student_profiles"("curriculum_program_id");
CREATE UNIQUE INDEX "academic_profile_versions_profile_id_version_key" ON "academic_profile_versions"("profile_id", "version");

ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_programs" ADD CONSTRAINT "curriculum_programs_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_programs" ADD CONSTRAINT "curriculum_programs_regulation_id_fkey" FOREIGN KEY ("regulation_id") REFERENCES "regulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_programs" ADD CONSTRAINT "curriculum_programs_degree_id_fkey" FOREIGN KEY ("degree_id") REFERENCES "degrees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_programs" ADD CONSTRAINT "curriculum_programs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_semesters" ADD CONSTRAINT "curriculum_semesters_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "curriculum_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_subjects" ADD CONSTRAINT "academic_subjects_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "curriculum_semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_units" ADD CONSTRAINT "subject_units_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "academic_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "curriculum_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "subject_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_topic_prerequisites" ADD CONSTRAINT "curriculum_topic_prerequisites_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "curriculum_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_topic_prerequisites" ADD CONSTRAINT "curriculum_topic_prerequisites_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "curriculum_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "curriculum_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_validation_results" ADD CONSTRAINT "content_validation_results_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "content_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_curriculum_program_id_fkey" FOREIGN KEY ("curriculum_program_id") REFERENCES "curriculum_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_profile_versions" ADD CONSTRAINT "academic_profile_versions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_profile_versions" ADD CONSTRAINT "academic_profile_versions_curriculum_program_id_fkey" FOREIGN KEY ("curriculum_program_id") REFERENCES "curriculum_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
