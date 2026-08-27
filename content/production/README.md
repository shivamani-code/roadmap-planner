# Production content sources

This directory contains the normalized, non-synthetic release catalog. Files remain subject to the StudentOS editor/reviewer publication workflow; their presence in the repository does not automatically publish them.

## JNTUH R25 B.Tech CSE

- Scope: B.Tech. Computer Science and Engineering under R25 at JNTUH non-autonomous affiliated colleges.
- Effective batch: academic year 2025-26 onward.
- Coverage: the official eight-semester course structure with detailed unit headings for semesters 1-4. Semesters 5-8 remain course-scope placeholders until JNTUH publishes matching detailed unit syllabi.
- Official source: `https://jntuh.ac.in/uploads/academics/R25B.Tech.CSEIIIYearSyllabusV2.pdf`
- Retrieved: 2026-08-25.
- SHA-256: `de1e7290f04f8fefdf3f022d4bb73ef62d68b542cfea93e4ab0f3331b35202c8`.
- Import: `jntuh-r25-cse-2026.08.1.json`.

The course structure, codes, credits, and semester placement are source-derived. Unit headings in semesters 1-4 are source-derived. Academic depth and effort fields are normalized planning metadata and must receive an independent content review before publication. Elective placeholders represent the official basket position; the chosen elective must be captured during student onboarding in a future elective-selection release. Semesters 5-8 must not be described as topic-complete until the official detailed syllabi are imported and reviewed.

Do not use this program for autonomous colleges, which may publish their own regulations and syllabi. Add each autonomous curriculum as a separate reviewed dataset instead of aliasing it to JNTUH R25.

## Career knowledge and projects

- Career import: `career-knowledge-2026.08.1.json` — 24 skills, four role tracks, three readiness levels per role, and 48 learning units.
- Project import: `project-templates-2026.08.1.json` — eight deployable portfolio projects and 32 evidence milestones.
- Mapping import: `jntuh-r25-cse-career-mappings-2026.08.1.json` — 24 reviewed curriculum-to-skill claims.
- Occupation references: O*NET Software Developers (15-1252.00), Web Developers (15-1254.00), and Data Scientists (15-2051.00).
- India alignment reference: National Career Service, National Classification of Occupations 2015, groups 2513–2514 and related software, database, and testing occupations.

O*NET and NCO inform role activities and skill coverage; they do not define StudentOS readiness scores. Required depths, importance, evidence potential, and effort percentiles are conservative StudentOS planning parameters. Project templates are StudentOS-authored evidence assignments, not university-prescribed projects or employer guarantees.
