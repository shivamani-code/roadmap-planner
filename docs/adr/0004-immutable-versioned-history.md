# ADR-0004: Version Content and Plans; Keep Evidence Append-Only

- **Status:** Accepted
- **Date:** 2026-08-24
- **Owners:** Backend Lead, QA Lead, Privacy Lead

## Context

Curricula and career requirements change. Student plans must adapt without rewriting why a past task existed. Task completion and skill evidence must survive role changes and retries while remaining auditable and privacy-deletable.

## Decision

Published content versions and roadmap revisions are immutable. A roadmap activation atomically supersedes the prior active revision while completed/in-progress history remains linked to its original version. Task completions and skill evidence are append-only, idempotent events; current skill/readiness/progress rows are rebuildable materializations. User deletion purges/anonymizes the event history according to the retention policy rather than overriding append-only operational behavior.

## Consequences

- Every plan and score is reproducible from versioned inputs.
- Role/content changes can show exact diffs and preserve transferable evidence.
- Storage and queries need explicit active-version pointers and retention jobs.
- Corrections create compensating evidence or new versions; direct edits are forbidden.

## Alternatives rejected

- **Mutable current plan only:** destroys reproducibility and makes recalculation unsafe.
- **Full event sourcing for every entity:** unnecessary complexity; only evidence/history use append-only semantics.
- **Copy progress per role:** duplicates and loses canonical transferability.

## Revisit when

Retention law, storage scale, or audit requirements require different archival strategies without sacrificing plan reproducibility.
