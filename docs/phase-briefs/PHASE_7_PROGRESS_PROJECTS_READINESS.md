# Phase 7: Progress, projects, and placement readiness

**Status:** Engineering gate complete  
**Date:** 25 August 2026

## Delivered

- Immutable evidence ledger integration for self-report, task completion, and reviewed project milestones, with rebuildable `student_skills` materialization.
- Task-evidence caps: an ordinary completion is capped at 0.65 proficiency/0.55 confidence; an allowlisted artifact-backed completion is capped at 0.80/0.82. Repeated checkmarks cannot cross the mastery boundary.
- Runtime project import validation against the canonical JSON Schema plus semantic checks for stable keys, effort percentiles, sequence uniqueness, and milestone weights.
- Two-person project publication, immutable template/version references, role fit, hard/soft prerequisites, ordered weighted milestones, deliverables, and deployment expectations.
- Deterministic project eligibility and ranking, one-active-primary-project enforcement, ordered artifact submission, independent rubric review, and 0.90-confidence milestone evidence.
- Transparent readiness calculation with role/dimension weighting, confidence applied once, frozen input hashes, explicit 69/79/89/100 claim gates, and a low-confidence fallback projection until two active weeks exist.
- Range-based 7/28/90-day progress aggregates and retained rolling snapshots tied to an immutable roadmap revision and algorithm version.
- Owner-scoped progress, skills/evidence, project, placement-profile, and readiness APIs.
- Connected responsive Progress, Skills, Projects, and Placement pages. Every visual meter has exact text values, project locks name their blockers, and readiness is explicitly labeled as preparation rather than hiring probability.

## Trust boundaries

- Project templates are reviewed content; the system does not invent them with AI.
- Artifact URLs must use HTTPS and an approved host. StudentOS stores the reference but does not fetch it server-side.
- Dataset editors cannot publish their own project dataset or review evidence generated from that dataset.
- Readiness materializations are reproducible from immutable evidence, current role requirements, gate state, and the named ruleset.
- A project recommendation requires an active roadmap and all hard prerequisite thresholds. A client cannot bypass those checks by posting a template ID directly.

## Main API surface

| Surface   | Endpoints                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Progress  | `GET /progress?days=7                                                                                           | 28  | 90` |
| Skills    | `GET /skills`, `GET /skills/{id}`                                                                               |
| Projects  | `GET /projects/recommendations`, `POST /student-projects`, `GET /student-projects/active`, milestone submission |
| Readiness | `GET /placement-readiness`, `GET/PUT /placement-profile`                                                        |
| Admin     | Project import/publish and milestone rubric review under `/admin/projects`                                      |

## Persistence

Migration `0007_progress_projects_readiness` adds published project datasets/templates, role fit, prerequisites, milestone templates/outcomes, student project progress, placement profiles/metrics, and progress snapshots. Partial unique indexes enforce one published project dataset and one active project per student.
