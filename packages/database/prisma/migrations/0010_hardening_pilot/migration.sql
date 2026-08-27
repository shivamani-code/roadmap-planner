ALTER TABLE "communication_preferences"
  ADD COLUMN "analytics_consent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "analytics_consent_at" TIMESTAMPTZ(3);

CREATE TABLE "pilot_feedback" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "surface" VARCHAR(32) NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_feedback_surface_check" CHECK (
    "surface" IN ('CURRICULUM_MAPPING', 'WEEKLY_PLAN', 'ROADMAP', 'TODAY', 'OVERALL')
  ),
  CONSTRAINT "pilot_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "pilot_feedback_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "pilot_feedback_user_id_created_at_idx"
  ON "pilot_feedback"("user_id", "created_at");
CREATE INDEX "pilot_feedback_surface_created_at_idx"
  ON "pilot_feedback"("surface", "created_at");

CREATE TABLE "account_deletion_tombstones" (
  "user_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "purge_after" TIMESTAMPTZ(3) NOT NULL,
  "recovered_at" TIMESTAMPTZ(3),
  "purged_at" TIMESTAMPTZ(3),
  "request_id" VARCHAR(128) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "account_deletion_tombstones_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "account_deletion_tombstones_status_check" CHECK (
    "status" IN ('PENDING', 'RECOVERED', 'PURGED')
  )
);

CREATE INDEX "account_deletion_tombstones_status_purge_after_idx"
  ON "account_deletion_tombstones"("status", "purge_after");
