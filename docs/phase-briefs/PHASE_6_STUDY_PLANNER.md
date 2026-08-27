# Phase 6: Study planner

**Status:** Engineering gate complete  
**Date:** 24 August 2026

## Delivered

- Pure local-date scheduler with Monday-aligned weeks, IANA timezone validation, day/time windows, 15% reserve, maximum sessions, three-session daily cap, and stable priority/dependency order.
- Deterministic milestone splitting into traceable task intents and lazy current/future week materialization.
- Versioned planning weeks/days, roadmap tasks, occurrence history, command receipts, and immutable completion records.
- Explicit `PLANNED → IN_PROGRESS → PARTIAL/COMPLETED` and planned skip/reschedule transitions.
- Optimistic locking plus request hashing and idempotency keys for retry-safe command/completion behavior.
- Dependency checks at task start, approved HTTPS artifact hosts, quantified partial progress, required skip reasons, and replacement-linked rescheduling.
- Owner-scoped Today and Week APIs with capacity, track split, next-task, source trace, and exact local dates.
- Connected Today dashboard with one dominant next action, start/partial/complete/skip/reschedule controls, and a responsive Week view with reserve and track allocation.

## Execution boundary

Week plans are lazily materialized from the active immutable roadmap revision. Completed occurrences are never moved; rescheduling closes the original and creates a linked replacement. The initial reserve is never silently consumed.

## Exit evidence

- State-machine tests cover every valid branch and reject terminal-state mutation.
- Scheduler tests cover dependency order, maximum sessions, per-day session count, weekly capacity, reserve, DST-crossing local dates, and 500 randomized deterministic loads.
- API E2E exercises roadmap→week→Today→start→completion, retries start/completion exactly once, rejects stale versions, preserves trace IDs, and reschedules through a linked replacement.
