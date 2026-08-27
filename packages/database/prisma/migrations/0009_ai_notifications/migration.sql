CREATE TYPE "AiUseCase" AS ENUM ('ROADMAP_EXPLANATION', 'WEEKLY_COACHING');
CREATE TYPE "AiExplanationSource" AS ENUM ('GENERATED', 'FALLBACK');
CREATE TYPE "NotificationType" AS ENUM (
  'TODAY_PLAN', 'MISSED_PLAN', 'WEEKLY_REVIEW', 'UPCOMING_EXAM', 'MILESTONE', 'PLACEMENT_CHECKPOINT'
);
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "NotificationIntentStatus" AS ENUM ('READY', 'SUPPRESSED', 'EXPIRED');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'SUPPRESSED', 'FAILED');

CREATE TABLE "communication_preferences" (
  "user_id" UUID NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  "daily_reminder_minute" INTEGER NOT NULL DEFAULT 1080,
  "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
  "quiet_start_minute" INTEGER NOT NULL DEFAULT 1320,
  "quiet_end_minute" INTEGER NOT NULL DEFAULT 420,
  "last_active_at" TIMESTAMPTZ(3),
  "ai_processing_consent" BOOLEAN NOT NULL DEFAULT false,
  "ai_consent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "communication_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "communication_preferences_minutes_check" CHECK (
    "daily_reminder_minute" BETWEEN 0 AND 1439 AND
    "quiet_start_minute" BETWEEN 0 AND 1439 AND
    "quiet_end_minute" BETWEEN 0 AND 1439
  ),
  CONSTRAINT "communication_preferences_ai_consent_check" CHECK (
    "ai_processing_consent" OR "ai_consent_at" IS NULL
  )
);

CREATE TABLE "notification_type_preferences" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT false,
  "email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_type_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_intents" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "dedupe_key" VARCHAR(96) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "action_url" VARCHAR(500) NOT NULL,
  "context" JSONB NOT NULL DEFAULT '{}',
  "state_hash" CHAR(64) NOT NULL,
  "status" "NotificationIntentStatus" NOT NULL DEFAULT 'READY',
  "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "read_at" TIMESTAMPTZ(3),
  "suppression_reason" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_intents_expiry_check" CHECK (
    "expires_at" IS NULL OR "expires_at" > "scheduled_for"
  )
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMPTZ(3),
  "suppression_reason" VARCHAR(64),
  "last_error" VARCHAR(2000),
  "provider_message_id" VARCHAR(255),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_attempt_check" CHECK ("attempt_count" >= 0)
);

CREATE TABLE "ai_explanation_cache" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "use_case" "AiUseCase" NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "prompt_version" VARCHAR(64) NOT NULL,
  "source" "AiExplanationSource" NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "content" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_explanation_cache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_request_audits" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "use_case" "AiUseCase" NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "prompt_version" VARCHAR(64) NOT NULL,
  "source" "AiExplanationSource" NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "allowed_id_count" INTEGER NOT NULL,
  "sent_fields" JSONB NOT NULL,
  "output_hash" CHAR(64) NOT NULL,
  "fallback_reason" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_request_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_request_audits_metrics_check" CHECK (
    "latency_ms" >= 0 AND "allowed_id_count" >= 0 AND
    ("input_tokens" IS NULL OR "input_tokens" >= 0) AND
    ("output_tokens" IS NULL OR "output_tokens" >= 0)
  )
);

CREATE UNIQUE INDEX "notification_type_preferences_user_id_type_key"
  ON "notification_type_preferences"("user_id", "type");
CREATE INDEX "notification_type_preferences_type_enabled_idx"
  ON "notification_type_preferences"("type", "in_app_enabled", "email_enabled");
CREATE UNIQUE INDEX "notification_intents_user_id_dedupe_key_key"
  ON "notification_intents"("user_id", "dedupe_key");
CREATE INDEX "notification_intents_user_id_created_at_idx"
  ON "notification_intents"("user_id", "created_at");
CREATE INDEX "notification_intents_status_scheduled_for_idx"
  ON "notification_intents"("status", "scheduled_for");
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key"
  ON "notification_deliveries"("notification_id", "channel");
CREATE INDEX "notification_deliveries_status_available_at_idx"
  ON "notification_deliveries"("status", "available_at");
CREATE UNIQUE INDEX "ai_explanation_cache_identity_key"
  ON "ai_explanation_cache"("user_id", "use_case", "input_hash", "prompt_version");
CREATE INDEX "ai_explanation_cache_expires_at_idx" ON "ai_explanation_cache"("expires_at");
CREATE INDEX "ai_request_audits_user_use_case_created_at_idx"
  ON "ai_request_audits"("user_id", "use_case", "created_at");
CREATE INDEX "ai_request_audits_source_created_at_idx"
  ON "ai_request_audits"("source", "created_at");
CREATE UNIQUE INDEX "outbox_ai_explanation_input_key"
  ON "outbox_events"("event_type", "aggregate_id")
  WHERE "event_type" = 'communication.ai-explanation-requested.v1';

ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_type_preferences" ADD CONSTRAINT "notification_type_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_type_preferences" ADD CONSTRAINT "notification_type_preferences_setting_fkey"
  FOREIGN KEY ("user_id") REFERENCES "communication_preferences"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "notification_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_explanation_cache" ADD CONSTRAINT "ai_explanation_cache_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_request_audits" ADD CONSTRAINT "ai_request_audits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
