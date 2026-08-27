# Domain Vocabulary and Invariants

This vocabulary is normative. Code, schemas, API contracts, analytics, and UI copy should use these terms unless an ADR changes them.

## Core terms

| Term                     | Definition                                                                                                                        | Not the same as                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Academic program         | A published combination of university, regulation, degree, branch, and curriculum dataset version.                                | College; a college usually selects a program rather than defining one. |
| Academic term            | A semester or other ordered period inside a program.                                                                              | Planning month/week.                                                   |
| Curriculum topic         | The smallest source-traceable academic concept in a subject unit.                                                                 | Canonical skill.                                                       |
| Canonical skill          | A stable, university-independent concept used by requirements, evidence, projects, and mappings.                                  | A subject title or course.                                             |
| Curriculum-skill mapping | Reviewed claim that a topic covers a skill to a specified breadth/depth/confidence.                                               | Student mastery.                                                       |
| Career role              | A versioned set of skill requirements for one occupational target.                                                                | Career domain, target level, or employer.                              |
| Target level             | The preparation depth within a role, such as internship, service-company placement, or product-company placement.                 | Salary/package promise.                                                |
| Role-skill requirement   | Required depth, importance, deadline offset, effort, and evidence expectations for a skill under a role version and target level. | Learning resource.                                                     |
| Proficiency estimate     | Best current estimate of a student's ability on a canonical skill.                                                                | Evidence confidence.                                                   |
| Evidence confidence      | Reliability of evidence supporting a proficiency estimate.                                                                        | Proficiency itself.                                                    |
| Effective proficiency    | Confidence-adjusted proficiency used by gap calculation.                                                                          | Raw self-rating.                                                       |
| Academic contribution    | Potential missing depth supplied by mapped curriculum before the required-by date.                                                | Existing readiness.                                                    |
| Independent gap          | Remaining role requirement after effective proficiency and academic contribution.                                                 | All career-only learning; extensions can contribute.                   |
| Learning unit            | Reviewed teach, practice, assess, or revise template addressing one or more skill outcomes.                                       | Scheduled task occurrence.                                             |
| Milestone                | Outcome with completion criteria inside Academic, Career, Project, or Placement track.                                            | A checkmark-only task.                                                 |
| Roadmap                  | Logical plan associated with one career goal.                                                                                     | A roadmap revision.                                                    |
| Roadmap revision         | Immutable, reproducible version of future-plan decisions and input/content/ruleset versions.                                      | Mutable live schedule.                                                 |
| Task                     | Logical planned activity tied to milestone, skills, reasons, and template.                                                        | Task occurrence.                                                       |
| Task occurrence          | A scheduled instance of a task on a date/time with a state.                                                                       | Completion/evidence event.                                             |
| Task completion          | Immutable record of completion outcome and actual duration.                                                                       | Proof of mastery by itself.                                            |
| Skill evidence           | Immutable signal used to estimate proficiency/confidence.                                                                         | Progress snapshot.                                                     |
| Placement readiness      | Transparent role-specific preparation index.                                                                                      | Employment or salary probability.                                      |
| Allocatable capacity     | Declared study availability after mode rules and the standard reserve.                                                            | Raw available time.                                                    |
| Exam mode                | Calendar-driven allocation policy favoring academics while preserving bounded career continuity.                                  | Pausing or deleting the career roadmap.                                |
| Material recalculation   | Revision that changes goal/profile/deadline/capacity materially or moves milestone dates significantly and needs consent.         | Micro-reschedule.                                                      |

## Canonical scales

### Normalized proficiency/depth

| UI level                   |  Value |
| -------------------------- | -----: |
| Not started                |   0.00 |
| Aware                      |   0.20 |
| Basic                      |   0.40 |
| Applied                    |   0.60 |
| Proficient                 |   0.80 |
| Interview/production ready |   1.00 |
| Unknown                    | `null` |

Unknown is not zero. Values stored by algorithms remain in `[0,1]` and are rounded only for display.

### Default evidence confidence

| Evidence type               | Value |
| --------------------------- | ----: |
| Self-report                 |  0.45 |
| Imported course completion  |  0.55 |
| Untimed in-app exercise     |  0.70 |
| Timed diagnostic/DSA result |  0.80 |
| Task with artifact          |  0.82 |
| Rubric-validated project    |  0.90 |
| Reviewed mock interview     |  0.90 |

### Learning layers

- `COLLEGE_COVERED`: curriculum meets depth in useful time; schedule evidence/practice rather than another beginner course.
- `COLLEGE_EXTENSION`: curriculum contributes but does not reach role depth.
- `CAREER_ONLY`: no reliable curriculum contribution before required-by date.

### Requirement classifications

`MASTERED`, `PARTIAL`, `COLLEGE_CURRENT`, `COLLEGE_FUTURE`, `COLLEGE_EXTENSION`, `INDEPENDENT`, `DEFERRED`, `NOT_REQUIRED`, `UNKNOWN`.

### Reason codes

| Code                   | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| `ROLE_REQUIRED`        | Needed by selected role/level.                           |
| `PLACEMENT_REQUIRED`   | Required for the selected placement preparation level.   |
| `PREREQUISITE_OF`      | Unlocks another required skill/project.                  |
| `ACADEMIC_SYNC`        | Scheduled near mapped curriculum.                        |
| `ACADEMIC_EXTENSION`   | Adds missing role depth beyond college coverage.         |
| `CAREER_ONLY`          | No meaningful timely curriculum coverage.                |
| `PROJECT_EVIDENCE`     | Produces portfolio/evidence for required skills.         |
| `LOW_CONFIDENCE_CHECK` | Verifies a low-confidence estimate.                      |
| `SPACED_REVISION`      | Maintains a previously learned placement-relevant skill. |
| `DEADLINE_URGENCY`     | Needed inside its lead-time window.                      |
| `EXAM_CONTINUITY`      | Small task retained during exam mode.                    |
| `OPTIONAL_EXCLUDED`    | Deliberately omitted for capacity/value reasons.         |

## States

- Roadmap revision: `DRAFT`, `VALIDATING`, `FAILED`, `READY`, `ACTIVE`, `SUPERSEDED`, `COMPLETED`, `PAUSED`.
- Task occurrence: `PLANNED`, `IN_PROGRESS`, `PARTIAL`, `RESCHEDULED`, `SKIPPED`, `COMPLETED`.
- Content: `DRAFT`, `VALIDATING`, `IN_REVIEW`, `PUBLISHED`, `SUPERSEDED`, `ARCHIVED`.
- Async job: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

## Identifiers and time

- Persistent IDs are application-generated UUIDv7 strings.
- Stable content keys use lowercase dot/kebab namespaces, for example `db.sql.joins` and `backend-engineer`.
- Versions are positive integers inside a stable key; imports additionally carry a semantic schema version and source checksum.
- Instants are UTC ISO 8601. Planning dates also carry an IANA timezone and local date.
- Durations use integer minutes. Effort estimates use `p25`, `p50`, and `p75` minutes/hours.

## Hard invariants

1. Same frozen inputs + content versions + ruleset version + seed produce the same normalized plan.
2. No task starts before an incomplete hard prerequisite.
3. Scheduled minutes never exceed allocatable day/week capacity.
4. Completed occurrences/evidence are append-only and are not moved by revision.
5. Every task links to a milestone, at least one skill, at least one reason code, and source requirement.
6. Published content is immutable; corrections create a new version.
7. AI cannot add requirements, change scores, activate revisions, or write evidence.
8. Unknown is never silently converted to mastered or not started.
9. Infeasible required work returns a decision state rather than an overbooked active plan.
10. Placement readiness is always labeled as preparation readiness and exposes components/gates.
