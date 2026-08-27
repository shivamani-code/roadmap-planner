# Phase 10 — Hardening and pilot readiness

## Objective

Turn the Phase 9 vertical product into a production-oriented pilot candidate with enforceable security/privacy controls, measurable pilot outcomes, deterministic data lifecycle operations, resilient worker behavior, accessible failure states, and repeatable launch evidence.

This brief implements `PRODUCT_DEVELOPMENT_SPEC.md` §§29, 35–40 and 45–50, especially the Phase 10 definition of done and the security/privacy/operations acceptance criteria.

## Engineering scope

- Enforce strict origin/CORS policy, secure headers, cookie-CSRF protection, and route-tiered IP/session rate limits. Production configuration must fail closed if CSRF or rate limiting is disabled.
- Add self-service machine-readable data export, separate analytics consent, immediate account disable/session revocation, a 30-day recoverable soft-delete window, worker cancellation, and deterministic purge/anonymization.
- Add lifecycle sweeps for AI cache/audit and notification retention and make unknown non-AI outbox events observable no-op events instead of accidental dead letters.
- Collect bounded pilot usefulness feedback and expose consent-aware, aggregate pilot metrics to authorized analysts/support staff.
- Add a persistent offline notice, recovery-oriented privacy controls, secure web response headers, automated accessibility checks, and 320 px/200% zoom-compatible styles.
- Add production-targeted load/security smoke harnesses and runbooks for backup/restore, incidents, provider outages, data rights, pilot rollout, UAT, browser/device audits, and launch evidence.

## Contracts and invariants

- `GET /privacy/export` returns only the authenticated student's data and records metadata-only audit evidence. It never exports session/verification secrets or another student's data.
- `PUT /privacy/preferences` changes analytics consent independently from essential service, notification, and AI settings.
- `POST /privacy/account-deletion` requires an exact confirmation phrase, atomically marks the account `DELETION_PENDING`, revokes all sessions, cancels queued/running generation work, suppresses pending deliveries, invalidates user-owned outbox work, and records an audit event.
- Soft-deleted accounts cannot authenticate. Purge is eligible only after 30 days. Purge removes student-scoped operational rows by database cascade, detaches review attribution where required, and anonymizes retained audit references.
- Retention sweeps are idempotent. Provider outages never block core planning; unknown domain events remain inspectable and are acknowledged by the default event sink.
- Rate-limit responses include `Retry-After` and do not reveal whether an account exists. Cookie-authenticated unsafe requests require a matching CSRF cookie/header pair.
- Pilot feedback is restricted to a five-point rating, a known product surface, and a short optional comment. Aggregate metrics include no email or free-form content.

## Test and evidence gates

- Real migrated PostgreSQL semantics cover export ownership, deletion/revocation/cancellation, 30-day purge, retention, and pilot metric aggregation.
- Security tests cover production fail-closed configuration, CSRF rejection/acceptance, rate-limit retry hints, origin policy, secure cookies, and object ownership.
- Component tests include automated accessibility checks plus offline and privacy recovery states.
- Monorepo format, lint, typecheck, tests, production builds, Prisma validation, migration replay, and high-severity dependency audit must pass.
- Load/security smoke harnesses must fail on latency/error/header thresholds and accept a production-like base URL without embedding credentials.

## Explicit non-goals and external gates

- This phase does not claim a production backup, OAuth, DNS/email authentication, browser/device lab, screen-reader manual audit, penetration test, or 100-student four-week pilot occurred locally.
- Human content/domain sign-off, legal privacy/terms/minor decisions, cloud topology/secret-manager evidence, real provider credentials, and measured pilot exit metrics remain deployment-owner gates. The repository must make each gate executable and recordable without fabricating evidence.
- No production curriculum dataset is added; synthetic fixtures remain clearly marked.
