# Phase 4: Assessment and gap analysis

**Status:** Engineering gate complete; reviewed mapping gate open  
**Date:** 24 August 2026

## Delivered

- Role-specific skill assessment with explicit `UNKNOWN`, immutable submission, and confidence-limited self-report evidence.
- Decay-aware evidence aggregation and versioned student skill estimates; unknown remains distinct from zero.
- Reviewed curriculum-to-skill mappings with published-source checks, rationale, depth, timing, practice, and confidence metadata.
- Versioned study availability with IANA timezone validation, overlap rejection, maximum sessions, and a fixed 15% reserve.
- Pure deterministic gap engine that separates known-now, reliable future-college contribution, and independent preparation.
- Frozen, idempotent gap snapshots tied to profile, goal, assessment, availability, curriculum, career, mapping, and ruleset versions.
- Explicit `INSUFFICIENT_CAPACITY` decisions with quantified deficit; no downstream roadmap may activate from an infeasible analysis.
- Connected five-step onboarding UI and an accessible skill-level explanation table.

## Trust boundary

Only mappings at or above the reviewed confidence threshold can reduce the independent gap. A curriculum topic arriving after the required date remains reinforcement rather than current preparation. Synthetic mappings prove the workflow outside production; real mappings still require expert review and provenance.

## Exit evidence

- Property tests reconcile three-layer contribution to exactly 100% across 1,000 generated inputs.
- Tests cover evidence decay, unknown state, low-confidence mappings, insufficient capacity, overlap validation, ownership, and input idempotency.
- API E2E exercises academic selection through role goal, assessment, availability, mapping, and gap report against real migrated PostgreSQL semantics.
