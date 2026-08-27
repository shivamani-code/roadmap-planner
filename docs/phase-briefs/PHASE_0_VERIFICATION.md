# Phase 0 Verification Report

**Date:** 24 August 2026  
**Status:** Engineering/documentation deliverables complete; named human reviewers must sign off before production content publication.  
**Ruleset exercised:** `prototype-1.0.0`

## Outcome

Phase 0 removed the foundational decisions needed to start Phase 1 platform scaffolding. The repository now contains accepted decision records, canonical vocabulary/invariants, logical data ownership, five versioned import/fixture schemas, synthetic cross-referenced content, a dependency-free deterministic planning proof, ten persona regressions, privacy/retention rules, an initial STRIDE threat model, Today-first information architecture, and a WCAG 2.2 AA design baseline.

No production JNTUH curriculum or career requirement has been asserted. All educational fixtures are explicitly synthetic.

## Artifact evidence

| Requirement                  | Evidence                                            | Result                                                                                                              |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ADRs                         | `docs/adr/0001` through `0006`                      | Six foundational decisions accepted with alternatives, consequences, owners, and revisit triggers.                  |
| Domain vocabulary/invariants | `docs/architecture/DOMAIN_VOCABULARY.md`            | Canonical terms, scales, reason codes, states, IDs/time, and 10 hard invariants.                                    |
| ERD/data ownership           | `docs/architecture/LOGICAL_DATA_MODEL.md`           | Aggregate boundaries, Mermaid ERD, transaction rules, and nonblocking Phase 1 decisions.                            |
| Import contracts             | `content/schemas/*.schema.json`                     | Five JSON Schema 2020-12 contracts parse successfully.                                                              |
| Synthetic fixtures           | `content/fixtures/*.json`                           | Curriculum, mapping, career, project, and 10 persona fixtures cross-reference successfully.                         |
| Algorithm proof              | `prototype/src/roadmap-engine.mjs`                  | Contribution, classification, priority, DAG order, capacity, feasibility, optional exclusion, and schedule packing. |
| Regression personas          | `content/fixtures/personas.synthetic.json`          | 10/10 scenarios match expected status, classification, capacity, and ordering.                                      |
| Privacy model                | `docs/privacy/DATA_CLASSIFICATION_AND_RETENTION.md` | Classification, inventory, minimization, retention, data-subject and AI rules.                                      |
| Threat model                 | `docs/threat-models/PHASE_0_STRIDE.md`              | Assets, actors, trust boundaries, 20 threats, mitigations, verification, and role owners.                           |
| IA/flows                     | `docs/ux/INFORMATION_ARCHITECTURE_AND_FLOWS.md`     | Desktop/mobile navigation and four critical low-fidelity flows.                                                     |
| Design/accessibility         | `docs/design/TOKENS_AND_ACCESSIBILITY_BASELINE.md`  | Semantic tokens, component behavior, responsive rules, and WCAG baseline.                                           |

## Automated verification

Run from `prototype/`:

```powershell
npm run validate
npm test
npm run personas
```

Observed results:

```text
Schemas parsed: 5
Synthetic subjects/topics: 2 / 3
Synthetic skills/roles: 10 / 2
Mappings/projects/personas: 3 / 1 / 10
Tests: 18 passed, 0 failed
```

Persona result summary:

| Persona                  | Result      | Weekly career ceiling | Required remaining | Key assertion                                                      |
| ------------------------ | ----------- | --------------------: | -----------------: | ------------------------------------------------------------------ |
| P01 beginner             | READY       |               357 min |          1,526 min | Unknown foundation remains unknown; prerequisite first.            |
| P02 intermediate backend | READY       |                   714 |              4,241 | Current/future academics produce extension, not duplicate mastery. |
| P03 role switch          | READY       |                   510 |              2,455 | Verified SQL/Git remain mastered; data gaps added.                 |
| P04 final year           | READY       |                   326 |              1,176 | Low-value optional framework excluded instead of overbooking.      |
| P05 one-hour/day         | READY       |                   306 |              3,085 | Dependency chain fits bounded weekly load.                         |
| P06 advanced             | READY       |                   612 |                334 | Beginner programming/arrays removed; tree practice remains.        |
| P07 data analyst         | READY       |                   510 |              2,703 | Future SQL/statistics synchronized; BI remains independent.        |
| P08 exam mode            | READY       |                   142 |                471 | Semester-exam career work is continuity-only.                      |
| P09 impossible deadline  | INFEASIBLE  |                   204 |              9,990 | Deficit is 8,358 minutes; no fake schedule emitted.                |
| P10 unsupported          | UNSUPPORTED |                   510 |                  0 | No AI/generic curriculum fallback emitted.                         |

## Invariants exercised

- Determinism: every persona result deep-equals a second run.
- Contribution reconciliation: current + academic + independent equals 100.0 after rounding.
- Capacity: every emitted week is at or below its mode-adjusted ceiling.
- Prerequisites: expected dependency subsequences are topologically ordered.
- Low-confidence mapping: confidence `0.64` contributes zero academic removal.
- Publication validation: cyclic career graph and project milestone weights not summing to 1 are rejected.
- Unsupported/infeasible: neither state emits an active schedule.

## Deliberate prototype limitations

The prototype is disposable proof code and must not be copied wholesale into production:

- It schedules one skill-level effort block sequentially, not reviewed learning units across day/month/semester horizons.
- It applies one planning mode across a persona's whole horizon rather than calendar ranges.
- It uses synthetic single-estimate effort and does not model p25/p50/p75 uncertainty.
- It proves prerequisite order and weekly capacity but not session splitting, academic track allocation, spacing, or project milestone placement.
- It uses custom semantic validation alongside parseable JSON Schemas to remain dependency-free; Phase 1/2 must add a standards-compliant JSON Schema validator in the import pipeline.
- It does not persist versions, enforce transactions, authenticate, call AI, send notifications, or represent production curriculum facts.

The production roadmap engine belongs to the domain/package boundaries specified for Phases 4–8.

## Risks and role owners

| Risk                                           | Accountable role                | Next gate                                                      |
| ---------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Curriculum source accuracy/usage rights        | Curriculum Content Lead         | Before any Phase 2 dataset is published.                       |
| Role/mapping bias or staleness                 | Career Knowledge Lead           | Before any Phase 3 role is published; quarterly review policy. |
| Self-assessment inflation/evidence calibration | Product + Data Lead             | Phase 4 diagnostic pilot.                                      |
| Deadline feasibility UX harms trust            | Product Designer + Product Lead | Phase 4 usability test.                                        |
| Object-level authorization/admin compromise    | Security + Backend Lead         | Phase 1 automated authorization matrix.                        |
| Minor/age and consent obligations              | Privacy/Legal Lead              | Before beta eligibility is set.                                |
| Artifact upload/URL security                   | Security Lead                   | ADR before Phase 7 artifact implementation.                    |
| Today-first flow comprehension                 | Product Designer/Research Lead  | Five-student low-fidelity test before visual feature build.    |

## Human review still required

This coding run cannot substitute for curriculum/career expert review, a threat-model workshop, student usability testing, legal/privacy approval, or stakeholder sign-off. Those activities are named release gates, not silently marked complete.

## Phase 1 entry recommendation

**Ready to begin platform scaffolding** once a human Product/Engineering owner acknowledges ADRs 0001–0006. The remaining listed choices—enum storage, UUIDv7 implementation, database RLS defense-in-depth, and artifact provider—have owners and do not block the initial monorepo, auth abstraction, config, observability, and migration skeleton. No production content should be published until content/security review gates pass.
