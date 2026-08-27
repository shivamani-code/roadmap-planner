# Phase 5: Roadmap engine

**Status:** Engineering gate complete; official-calendar and expert-content gates open  
**Date:** 24 August 2026

## Delivered

- Pure `roadmap-1.0.0` engine with required hard-prerequisite closure, cycle rejection, stable topological ordering, and the specified weighted priority score.
- Reviewed learning-unit selection, conservative unknown handling, mastery-aware revision, optional exclusions, and missing-template blocking.
- Deterministic term allocation with a 15% capacity reserve, academic synchronization preference, required-by checks, and explicit trade-off risks instead of overbooking.
- Hard-invariant validator for prerequisite inversion, duplicate milestones, orphan traceability, and term capacity.
- Logical roadmaps, immutable revisions, terms, milestones, dependency edges, generation jobs, exact input snapshots, risks, and source traces in PostgreSQL.
- Idempotent generation API, owner-scoped job/current/term reads, atomic first activation, and outbox activation event.
- Connected generation state, graduation timeline, semester detail, monthly horizon, track labels, exclusions, and source-template visibility.

## Calendar boundary

Until an official academic calendar is selected, generation uses frozen deterministic 16-week planning terms and records `DETERMINISTIC_16_WEEK_TERMS` in the input snapshot. This preserves reproducibility without claiming those dates are official. Exam calendars and consented recalculation are Phase 8 concerns.

## Exit evidence

- 1,000 generated DAGs produce byte-equivalent logical results with no capacity or dependency violations.
- Tests cover prerequisite closure, stable priority ties, cycles, missing references, optional exclusion, mastery revision, unknown skills, insufficient capacity, and missing reviewed content.
- API E2E activates a roadmap from the accepted gap, returns the same job on retry, inspects a traced term, and rejects cross-user job/term reads.
- Phase 0's ten golden personas remain in the repository-wide regression gate, including infeasible and unsupported decisions.
