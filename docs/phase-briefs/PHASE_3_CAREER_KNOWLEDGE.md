# Phase 3: Career knowledge

**Status:** Engineering gate complete; expert-review gate open  
**Date:** 24 August 2026

## Delivered

- Draft 2020-12 role/skill/learning-unit import validation plus semantic duplicate, reference, DAG, effort-percentile, depth-range, reviewer-separation, and required-skill coverage checks.
- Immutable PostgreSQL career datasets, canonical skills, typed prerequisite edges, domains, role versions, target-level requirements, and learning-unit templates.
- Admin stage/review/publish endpoints and connected curriculum/career operations interface using server-enforced editor/reviewer roles.
- Public role catalog summaries with exact version, target levels, required/optional counts, p50 effort, and leading skills.
- Career goal onboarding constrained to a published role/level, a completed academic profile, a future deadline, and the student's graduation boundary.
- Append-only goal versions, optimistic concurrency, audit history, and onboarding-state advancement.
- Responsive role comparison and goal-selection UI with explicit no-catalog behavior and no employment-probability claims.

## Publication boundary

Non-production environments can publish a fully covered synthetic graph for E2E verification. Production also requires a non-synthetic dataset, at least four expert-reviewed MVP roles, no missing learning-unit coverage, and independent review. The existing Phase 0 fixture intentionally exposes coverage gaps and is therefore not publishable as a production catalog.

## Exit evidence

- Validator regressions cover missing references, cycles, inverted effort ranges, coverage gaps, and production restrictions.
- API E2E publishes a four-role, fully covered synthetic graph and saves an exact versioned student goal after academic onboarding.
- Goal creation cannot bypass academic onboarding or select an absent role-level combination.
