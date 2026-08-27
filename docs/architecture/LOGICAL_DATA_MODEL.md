# Logical Data Model and Ownership

This Phase 0 model refines §§27–28 of the product specification. It is logical, not a migration. Phase 1 must translate it into reviewed PostgreSQL/Prisma migrations without changing ownership or invariants silently.

## Aggregate boundaries

| Aggregate/module    | Roots                                         | Owns                                                                                       | References only                             |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Identity            | User, Session                                 | Auth accounts, sessions, verification tokens                                               | None                                        |
| Student Profile     | StudentProfile, CareerGoal, StudyAvailability | Profile versions, windows, exam overrides, preferences                                     | Published curriculum/role IDs               |
| Curriculum          | CurriculumProgram                             | University, regulation, degree, branch, terms, subjects, units, topics, calendar templates | Canonical skill IDs through mapping module  |
| Career Knowledge    | CareerRole, Skill, ProjectTemplate            | Requirements, prerequisites, learning units, project milestones/rubrics                    | Curriculum topic IDs through mapping module |
| Mapping             | CurriculumSkillMapping                        | Versioned topic→skill coverage/rationale                                                   | Curriculum topic and skill versions         |
| Assessment/Evidence | SkillAssessment, SkillEvidence                | Responses, diagnostics, current skill materialization                                      | User, skill                                 |
| Gap                 | GapAnalysis                                   | Per-skill classifications/contributions/effort                                             | Frozen profile/content/evidence versions    |
| Roadmap             | Roadmap                                       | Revisions, terms, milestones, logical tasks, exclusions/risks                              | Gap analysis, content versions              |
| Scheduling          | WeeklyPlan                                    | Monthly/daily plans and task occurrences                                                   | Roadmap revision/tasks, availability        |
| Progress            | TaskCompletion, WeeklyReview                  | Snapshots and aggregates                                                                   | Occurrence, user, revision                  |
| Projects            | StudentProject                                | Student milestones/artifacts                                                               | Project template/version, user              |
| Readiness           | PlacementMetric                               | Dimension results, gates, projection                                                       | Goal/role/evidence/project versions         |
| Operations          | GenerationJob, Notification, ContentImport    | Outbox, delivery, validation, audit                                                        | Owner/actor/resource identifiers            |

## Logical ER diagram

```mermaid
erDiagram
    USER ||--|| STUDENT_PROFILE : owns
    USER ||--o{ CAREER_GOAL : sets
    USER ||--o{ STUDY_AVAILABILITY : declares
    STUDY_AVAILABILITY ||--o{ AVAILABILITY_WINDOW : contains
    USER ||--o{ EXAM_PERIOD : overrides

    UNIVERSITY ||--o{ COLLEGE : affiliates
    UNIVERSITY ||--o{ REGULATION : publishes
    REGULATION ||--o{ CURRICULUM_PROGRAM : versions
    DEGREE ||--o{ CURRICULUM_PROGRAM : scopes
    BRANCH ||--o{ CURRICULUM_PROGRAM : scopes
    CURRICULUM_PROGRAM ||--o{ ACADEMIC_TERM : contains
    ACADEMIC_TERM ||--o{ SUBJECT : contains
    SUBJECT ||--o{ SUBJECT_UNIT : contains
    SUBJECT_UNIT ||--o{ CURRICULUM_TOPIC : contains

    CAREER_DOMAIN ||--o{ CAREER_ROLE : contains
    CAREER_ROLE ||--o{ ROLE_SKILL_REQUIREMENT : defines
    SKILL ||--o{ ROLE_SKILL_REQUIREMENT : required
    SKILL ||--o{ SKILL_PREREQUISITE : depends
    CURRICULUM_TOPIC ||--o{ CURRICULUM_SKILL_MAPPING : maps
    SKILL ||--o{ CURRICULUM_SKILL_MAPPING : receives
    PROJECT_TEMPLATE ||--o{ PROJECT_SKILL_REQUIREMENT : gates
    SKILL ||--o{ PROJECT_SKILL_REQUIREMENT : required

    USER ||--o{ SKILL_ASSESSMENT : takes
    SKILL_ASSESSMENT ||--o{ ASSESSMENT_RESPONSE : contains
    USER ||--o{ SKILL_EVIDENCE : earns
    SKILL ||--o{ SKILL_EVIDENCE : evidenced
    USER ||--o{ STUDENT_SKILL : materializes

    USER ||--o{ GAP_ANALYSIS : receives
    GAP_ANALYSIS ||--o{ GAP_ANALYSIS_ITEM : classifies
    CAREER_GOAL ||--|| ROADMAP : drives
    ROADMAP ||--o{ ROADMAP_REVISION : versions
    ROADMAP_REVISION ||--o{ ROADMAP_TERM : allocates
    ROADMAP_TERM ||--o{ ROADMAP_MILESTONE : contains
    ROADMAP_MILESTONE ||--o{ TASK : satisfies
    ROADMAP_REVISION ||--o{ WEEKLY_PLAN : schedules
    WEEKLY_PLAN ||--o{ DAILY_PLAN : contains
    DAILY_PLAN ||--o{ TASK_OCCURRENCE : places
    TASK ||--o{ TASK_OCCURRENCE : instantiates
    TASK_OCCURRENCE ||--o| TASK_COMPLETION : completes
    TASK_COMPLETION ||--o{ SKILL_EVIDENCE : emits

    USER ||--o{ STUDENT_PROJECT : undertakes
    PROJECT_TEMPLATE ||--o{ STUDENT_PROJECT : instantiates
    STUDENT_PROJECT ||--o{ STUDENT_PROJECT_MILESTONE : contains
    USER ||--o{ PLACEMENT_METRIC : measures
    USER ||--o{ PROGRESS_SNAPSHOT : summarizes
```

## Cross-aggregate rules

1. A client never writes a foreign aggregate directly. The owning application service validates references and commands the owner.
2. Content references include stable key and immutable version ID. Display names may change only through new versions.
3. Roadmap activation, active-pointer change, and outbox event commit in one transaction.
4. Task completion, evidence creation, and progress-outbox event commit in one transaction.
5. Materializations (`student_skills`, readiness, progress snapshots) are rebuildable; immutable sources are not overwritten.
6. Published content cannot be hard-deleted while referenced. Archival prevents new selection.
7. User deletion uses an orchestrated purge across modules; audit records retain non-identifying hashes only after the legal recovery window.

## Phase 1 migration decisions still required

- PostgreSQL enum versus lookup/check strategy for high-change states.
- Exact UUIDv7 generator implementation supported by selected Prisma/PostgreSQL versions.
- Row-level security as defense-in-depth versus service-enforced ownership only.
- Partition threshold for evidence/analytics tables; no partitioning is required before measured need.
- Artifact metadata and antivirus provider contract.

None blocks application/API scaffolding; each must have an ADR before its implementation.
