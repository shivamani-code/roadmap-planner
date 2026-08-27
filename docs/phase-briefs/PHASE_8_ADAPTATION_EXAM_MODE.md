# Phase 8: Adaptation, exam mode, and roadmap consent

**Status:** Engineering gate complete  
**Date:** 25 August 2026

## Delivered

- A deterministic four-week exponentially weighted load signal (`alpha = 0.4`) that requires two reviewed weeks, uses bounded 0.80–1.15 multipliers, and never exceeds declared study availability.
- One weekly review per student and calendar week across roadmap versions. Reviews retain planned/completed task and minute aggregates, actual duration, perceived difficulty, early-finish signal, chosen multiplier, and ruleset version.
- Confirmed internal-exam, semester-exam, vacation, and placement-week periods with provenance. Unconfirmed inferred periods request confirmation without changing planning mode.
- Exam-aware weekly materialization. Internal exams reserve 60–75% for academics and cap career continuity at 45 minutes per day; semester exams reserve 80–90% for academics and allow at most two short career sessions. Project work is deferred during exam peaks.
- Manual rescheduling revalidates total capacity and exam-mode academic share, career minutes per day, and career session count. A client cannot bypass protected academic capacity by moving an existing task.
- Smooth deferred-work placement into genuine future spare capacity without catch-up spikes or silent deadline compression.
- Immutable, versioned roadmap previews with retained, changed, new, and no-longer-required groups; input hashes; 30-day expiry; optimistic activation; rejection; atomic supersession; and event publication.
- Automatic activation only for weekly load changes moving at most 10% of hours with no milestone-date changes. Material, exam, role, and content revisions require explicit consent.
- Completed and in-progress history remains locked. A completion can satisfy retained work through any number of roadmap versions, and stale-revision task commands are rejected.
- Role/content revisions match progress by canonical skill stable key, carry eligible evidence to the published target skill version, add reviewed learning units for new requirements, remove only unlocked future work, and update the active career-goal version atomically.
- Connected Weekly Review, Exam Calendar, Recalculate, and exam-aware Week interfaces with accessible status messaging and explicit consent actions.

## Trust boundaries

- Review text is a planning input, not authoritative academic data.
- Student-created exam periods are explicit and confirmed. Template-sourced periods must be confirmed before affecting the plan.
- Adaptation changes utilization within the student's declared windows; it cannot invent availability.
- Ordinary onboarding cannot mutate a career goal after a roadmap is active. Material goal changes must use a previewed roadmap revision.
- Published role requirements and reviewed learning units remain the only source for role/content migration. The revision service does not invent skills or learning content.
- The active roadmap remains readable and executable while a consent-gated preview is open. Rejection leaves it unchanged and does not block later preview version numbers.

## Main API surface

| Surface   | Endpoints                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Review    | `POST /weekly-reviews`                                                                                                                        |
| Calendar  | `GET/POST /exam-periods`, `PATCH /exam-periods/{id}/confirmation`, `GET /planning-mode`                                                       |
| Revisions | `POST /roadmap-revisions`, `GET /roadmap-revisions/{id}/diff`, `POST /roadmap-revisions/{id}/activate`, `POST /roadmap-revisions/{id}/reject` |
| Planner   | Existing week/day/task endpoints now enforce active-version and planning-mode constraints                                                     |

## Persistence

Migration `0008_adaptation_exam_revisions` adds weekly reviews keyed by student/week, typed exam periods and provenance, revision diff/consent records, planning-mode snapshots, and task lineage/completion-satisfaction references. A partial unique index permits one open roadmap draft per roadmap while rejected/expired versions remain auditable.

## Operational ruleset

- Adaptation and revisions identify `adaptation-1.0.0` in persisted input snapshots and responses.
- Existing generated roadmaps remain immutable; every future-plan change creates a new numbered revision.
- Revision numbering follows the highest issued version, not only the active version, so rejected previews never reuse lineage numbers.
