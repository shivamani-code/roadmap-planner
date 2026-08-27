# Phase 2: Academic system

**Status:** Engineering gate complete; official-content review gate open  
**Date:** 24 August 2026

## Delivered

- Standards-compliant Draft 2020-12 curriculum import validation with date/URI formats.
- Duplicate, missing-reference, prerequisite-cycle, numeric-range, and eight-semester coverage checks.
- Normalized PostgreSQL curriculum hierarchy from university through versioned topics and prerequisite edges.
- Staged import records, validation evidence, editor/reviewer role enforcement, separation of duties, immutable publication, supersession, audit, and outbox events.
- Public dependent catalog endpoint that returns only published combinations and excludes synthetic content in production.
- Authenticated, optimistic-lock-aware academic profile upsert with append-only versions and an exact curriculum snapshot.
- Connected admin import/review interface and responsive student academic onboarding with loading, empty, error, partial-coverage, and saved states.

## Safety boundary

The repository's educational fixtures are synthetic. They can exercise the complete workflow outside production but cannot be selected in production. A production publication additionally blocks synthetic markers, placeholder checksums, and absent permission evidence.

The engineering phase does not claim that a JNTUH source has been licensed, fully imported, or expert-reviewed. That content gate requires an authoritative source, recorded checksum/rights, and a reviewer who is not the editor.

## Exit evidence

- The full monorepo formatting, lint, strict-type, test, and production-build gate passes.
- The dependency audit reports no known vulnerabilities.
- API E2E proves editor staging, editor publication denial, independent reviewer publication, dependent catalog listing, valid profile selection, profile version creation, and conflict rejection.
- Academic unit tests prove schema validation, honest partial coverage, missing-reference rejection, cycle rejection, and production synthetic-source rejection.
