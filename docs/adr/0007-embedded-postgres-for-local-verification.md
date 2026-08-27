# ADR 0007: Embedded PostgreSQL for local verification only

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Platform Engineering

## Context

StudentOS requires production PostgreSQL semantics, repeatable migrations, and fast tests on developer machines and CI. The current workspace does not guarantee a locally managed PostgreSQL service or Docker. Replacing relational tests with mocks would fail to exercise constraints, transactions, and SQL migrations.

## Decision

Production and shared deployed environments use PostgreSQL through Prisma's official `@prisma/adapter-pg` driver adapter. Automated database tests and explicitly selected single-process local smoke tests may run the same SQL migration files against PGlite through `pglite-prisma-adapter`.

PGlite is not an allowed production database mode. Runtime configuration rejects `DATABASE_MODE=pglite` when `NODE_ENV=production`. The community Prisma adapter is isolated behind `packages/database` and can be replaced without changing domain or API code.

## Consequences

- Database tests verify real SQL constraints and transaction behavior without an external service.
- The migration runner records ordered migrations and is idempotent.
- PGlite cannot prove every production PostgreSQL operational behavior, extension, concurrency pattern, or performance characteristic.
- Pre-release environments must run migrations and integration tests against managed PostgreSQL before launch.

## Alternatives considered

- **Mocks or SQLite:** rejected because they do not exercise the selected database's semantics.
- **Docker-only tests:** useful later, but rejected as the sole local gate because Docker is not guaranteed.
- **PGlite in production:** rejected because the architecture requires managed PostgreSQL durability and operational controls.

## Revisit trigger

Revisit when the repository gains containerized integration infrastructure or the adapter becomes incompatible with the supported Prisma version.
