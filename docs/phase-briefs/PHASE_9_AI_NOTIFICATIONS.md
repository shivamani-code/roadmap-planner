# Phase 9: Bounded AI communication and notifications

**Status:** Engineering gate complete  
**Date:** 25 August 2026

## Delivered

- A provider-neutral `@studentos/communication` package containing input minimization, PII redaction, approved use-case instructions, structured output contract, allowlisted-ID grounding, injection/URL/numeric-claim rejection, deterministic fallbacks, timeout handling, quiet-hours policy, recent-activity suppression, and stable notification dedupe keys.
- Roadmap explanation and weekly coaching use cases that receive only pseudonymous structured facts. Authoritative minutes, dates, tracks, roles, IDs, and reason codes stay separate from generated wording and are rendered directly from database facts.
- Deterministic template guidance when AI consent is absent, provider configuration is absent, output is invalid, or the provider is unavailable. Core roadmap, review, planning, task, evidence, score, and readiness flows do not depend on AI.
- Separate, revocable AI-processing consent. Enabling consent may enqueue a minimized explanation-enhancement job; revoking it deletes explanation caches, cancels pending jobs, and is re-checked by a worker already holding a job.
- Transactional explanation cache, redacted request audit, and outbox enqueue. Audits store input/output hashes, top-level sent field names, allowlist count, prompt/model/provider versions, latency/tokens, source, and fallback reason—never prompt/fact payloads.
- Asynchronous provider enhancement through the existing outbox processor with exponential retry. Validated output can update only the explanation cache; it cannot write roadmaps, tasks, skills, scores, or evidence.
- Opt-in in-app/email preferences for Today, missed plan, weekly review, upcoming exam, milestone, and placement checkpoint notifications, plus timezone, daily reminder time, and overnight quiet hours. All notification types default off and there are no streak notifications.
- A deterministic worker scheduler that creates delivery-independent intents, uses database uniqueness for retry/concurrency dedupe, suppresses recent activity for Today reminders, and creates separate channel-delivery records.
- Immediate in-app delivery and configurable email-gateway delivery with retry/backoff, provider-disabled audit, expiry, and state re-check immediately before sending. Exam confirmation, active roadmap/task state, weekly review, milestone, placement profile, preference, quiet hours, and consent are revalidated.
- Connected grounded-guidance panels, Inbox, per-channel notification controls, quiet-hours controls, and separate AI wording consent. The UI labels deterministic fallback versus provider-generated wording and states that AI cannot change plan facts.

## Trust boundaries

- AI receives structured, minimized facts through one gateway. Email, display name, exact college, roll number, notes, artifact URLs, tokens, secrets, and unrelated profile fields are denied or redacted.
- Generated output must match the supplied schema, select only supplied IDs, contain no URLs or numeric/date claims, and pass injection/safety checks. Exact quantitative facts are rendered outside generated prose.
- Provider calls run only after consent and only in the worker. The synchronous API always has a deterministic response.
- Resource URLs are not an AI output in this phase. No free-form chatbot or AI roadmap exists.
- Notification generation uses current database state and user preferences. Delivery re-checks the structured intent context; a stale exam, completed task, submitted review, superseded milestone, disabled preference, or quiet period suppresses/defer delivery.
- Email gateways receive the notification intent contract, not planning history. Provider tokens exist only in server/worker configuration.

## Main API surface

| Surface     | Endpoints                                                                      |
| ----------- | ------------------------------------------------------------------------------ |
| Guidance    | `GET /communication/roadmap-explanation`, `GET /communication/weekly-coaching` |
| Preferences | `GET/PUT /communication/preferences`                                           |
| Activity    | `POST /notifications/activity`                                                 |
| Inbox       | `GET /notifications`, `PATCH /notifications/{id}/read`                         |

## Persistence and jobs

Migration `0009_ai_notifications` adds communication preferences, per-type/channel opt-ins, notification intents and deliveries, AI explanation cache, and redacted AI request audits. It also adds a partial unique outbox key for one enhancement job per use-case input hash. Notification intents persist minimal JSON context plus a state hash so delivery can re-check the exact source record without exposing that context to the inbox response.

The worker performs two independent loops:

1. claim and process transactional outbox events, including optional AI wording enhancement;
2. generate notification intents and deliver pending email records according to current state and preferences.

In-app intent remains useful when email or AI providers are disabled.
