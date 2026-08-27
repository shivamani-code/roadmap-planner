# Phase 9 Verification Report

**Date:** 25 August 2026  
**Decision:** Ready for Phase 10 hardening and pilot launch evidence.

## Invariants verified

- Redaction removes prohibited camelCase/snake-case fields recursively and masks email addresses embedded in otherwise allowed labels.
- Generated explanations reject invented IDs, duplicate IDs, numeric/date claims, links, prompt-injection language, malformed structure, and excessive text.
- Provider-disabled, provider-error, timeout, and invalid-output paths return the deterministic explanation contract without changing core product data.
- Valid provider wording is persisted only after schema/grounding validation; audit records contain field names and hashes rather than facts or prompt content.
- Provider calls are asynchronous. A page request returns fallback guidance and atomically enqueues at most one enhancement job for the input hash.
- AI jobs retry provider outages through outbox backoff. Consent is checked both when enqueuing and when handling; revocation cancels pending work and clears cached wording.
- Every notification type/channel defaults off. A complete preference payload is required, timezone and minutes are validated, and AI consent changes have a user audit record.
- Quiet hours support intervals crossing midnight in the configured IANA timezone. Today reminders are suppressed when the app was active within the prior thirty minutes.
- Notification dedupe keys are stable for the same user/type/scope and different across dates/scopes. Database uniqueness collapses concurrent/retried generation.
- An exam reminder creates one delivery-independent intent with separate in-app and email states. Re-running generation dedupes it; disabling confirmation before send changes email delivery to `STALE_STATE` suppression.
- Email provider absence is recorded as `PROVIDER_DISABLED`; transient provider errors back off and stop after the delivery attempt limit.
- Inbox list/read operations and guidance are owner-scoped. Another authenticated account receives no student notification or explanation object.
- The complete curriculum → planning → evidence → adaptation E2E remains green with AI provider calls disabled; deterministic guidance and notification preferences do not block it.

## Automated gate

- Communication package: five tests cover recursive redaction, unsupported-claim/injection rejection, valid generation, invalid/outage fallback, timezone quiet hours, recent activity, stable dedupe, and date distance.
- Worker: four tests across three files cover outbox once/retry behavior, real-migration notification generation/channel dedupe/provider suppression/state re-check, and real-migration AI enhancement persistence plus provider-outage retry.
- Database: all ordered migrations, including `0009_ai_notifications`, apply and reapply idempotently in embedded PostgreSQL.
- API: strict types, lint, configuration validation, and six tests pass. E2E covers fallback/cache, allowlisted focus IDs, redacted audits, opt-in defaults, invalid timezone, AI queue/revocation, inbox ownership, and read state.
- Web: strict types, lint, five component/utility tests, and the Next.js production build pass with 21 routes including `/notifications`.
- The final monorepo formatting, lint, typecheck, test, build, migration, and dependency-audit result is recorded at the phase gate.

## Human and external evidence still required

- A production provider/model is not configured in this repository. Prompt/model release still requires at least 99.5% schema validity, zero unsupported claims in the full human-approved golden set, cost/latency review, and sampled human tone/readability approval.
- A production transactional-email gateway/domain is not configured. Domain authentication, unsubscribe headers, reputation, bounce/complaint handling, and real mailbox rendering are Phase 10 deployment evidence.
- Pilot students must validate that deterministic/generated labels, consent wording, coaching tone, quiet-hours controls, and missed-plan language are understandable and non-coercive.
- Retention cleanup, export/delete inclusion, load behavior, accessibility/browser audit, and operational dashboards remain Phase 10 gates.
