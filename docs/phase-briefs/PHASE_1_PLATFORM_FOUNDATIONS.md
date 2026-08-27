# Phase 1: Platform foundations

**Status:** Complete at the engineering gate  
**Date:** 24 August 2026

## Outcome

Phase 1 turns the Phase 0 architecture into a runnable production-oriented skeleton. The monorepo now has independently buildable student web, admin, API, and worker applications; shared typed contracts, domain rules, database access, and observability; an initial PostgreSQL migration; passwordless session authentication; health endpoints; an OpenAPI surface; a transactional outbox; and CI quality gates.

## Delivered scope

| Area          | Delivery                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces and Turborepo task graph with locked toolchain versions.                                                                                                               |
| Student web   | Responsive Next.js App Router shell, outcome-led landing page, sign-in flow, privacy baseline, and onboarding route boundary.                                                          |
| Admin         | Separate Next.js content-operations shell with explicit role and separation-of-duties policy tests.                                                                                    |
| API           | NestJS versioned API, environment validation, Helmet, constrained credentialed CORS, DTO validation, typed problem responses, request IDs, OpenAPI, and graceful shutdown.             |
| Identity      | Normalized-email user creation, expiring one-use magic links, hashed tokens/sessions, secure cookie flags, session lookup, logout, and production protection against development auth. |
| Persistence   | Prisma 7, official PostgreSQL driver adapter, Phase 1 identity/outbox/audit schema, checked-in SQL migration, and embedded PostgreSQL verification boundary.                           |
| Async work    | Transactional outbox creation and a claim/process/retry/fail worker with bounded exponential backoff.                                                                                  |
| Observability | Shared structured logger with sensitive-field redaction, trace wrapper, correlation response header, health probes, and non-sensitive worker events.                                   |
| Automation    | CI checks formatting, lint, strict types, tests, production builds, and high-severity dependency audit.                                                                                |

## Architectural boundaries

- PostgreSQL remains the production system of record. PGlite is test/local-only and rejected by production configuration.
- The API and worker consume shared package interfaces; application layers do not construct ad hoc database clients.
- Domain events are stored in the same transaction as identity creation and delivered asynchronously from the outbox.
- Development magic-link disclosure is opt-in and structurally unavailable in production. A real email/OIDC provider is a later integration gate.
- The `/onboarding` route is intentionally a Phase 2 handoff boundary, not a completed curriculum workflow.

## Exit criteria

- All workspace packages lint and type-check under strict TypeScript.
- Unit, integration, and API end-to-end tests pass.
- Both Next applications and both Node services produce production builds.
- The production migration runs against PostgreSQL semantics and can be reapplied idempotently by the embedded runner.
- Invalid production configurations fail closed.
- Sensitive authentication and personal-data log fields are redacted.
- Local operation and CI procedures are documented.

## Deferred gates

- Production identity provider delivery/verification, key rotation, rate limiting, explicit CSRF token defense, and full object-authorization matrix are security hardening gates before public beta.
- Managed PostgreSQL migration rehearsal and deployment are environment gates, not local-code claims.
- Curriculum ingestion and onboarding begin in Phase 2; no synthetic fixture is production truth.
