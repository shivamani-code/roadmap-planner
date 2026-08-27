-- Phase 1: identity, sessions, audit, and transactional outbox foundation.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING', 'DELETED');
CREATE TYPE "VerificationPurpose" AS ENUM ('SIGN_IN', 'EMAIL_CHANGE');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(120),
    "avatar_url" VARCHAR(2048),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-IN',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "last_login_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent_hash" CHAR(64),
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" VARCHAR(128),
    "action" VARCHAR(160) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "before_hash" CHAR(64),
    "after_hash" CHAR(64),
    "request_id" VARCHAR(128) NOT NULL,
    "ip_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");
CREATE INDEX "users_status_deleted_at_idx" ON "users"("status", "deleted_at");
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");
CREATE UNIQUE INDEX "auth_accounts_provider_provider_subject_key" ON "auth_accounts"("provider", "provider_subject");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_expires_at_revoked_at_idx" ON "sessions"("expires_at", "revoked_at");
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");
CREATE INDEX "verification_tokens_normalized_email_purpose_expires_at_idx" ON "verification_tokens"("normalized_email", "purpose", "expires_at");
CREATE INDEX "outbox_events_status_available_at_created_at_idx" ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");
CREATE INDEX "audit_logs_target_type_target_id_created_at_idx" ON "audit_logs"("target_type", "target_id", "created_at");
CREATE INDEX "audit_logs_actor_type_actor_id_created_at_idx" ON "audit_logs"("actor_type", "actor_id", "created_at");

ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
