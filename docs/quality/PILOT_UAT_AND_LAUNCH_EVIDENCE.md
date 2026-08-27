# Pilot, UAT, accessibility, and launch evidence

## Rollout

Progress only through internal → content reviewers → 20-student alpha → 100-student/four-cohort four-week pilot → public beta. Rollback disables a feature/content version without deleting active history. The analyst endpoint `GET /api/v1/admin/pilot/metrics?since=YYYY-MM-DD` reports consented aggregate onboarding, activation, week-four retention, generation, usefulness, and an explicit human trace-review gap.

Public-beta gates: roadmap activation ≥65%, median first generation <15 s, hard-invariant failure <0.5%, seven-day activation ≥60%, week-four meaningful retention ≥45%, usefulness median ≥4/5, sampled trace accuracy ≥95%, zero Sev-1 privacy/security events, and no unreviewed published content.

## Required human matrix

- Browsers: current/previous Chrome, Edge, Firefox, Safari; priority Android mobile web.
- Viewports: 320 px, tablet, desktop; 200% zoom; portrait/landscape.
- Access: keyboard-only, visible focus, screen reader, contrast, reduced motion, exact text alternatives, loading/empty/error/offline/conflict recovery.
- UAT: onboarding, unsupported curriculum, infeasible deadline, generation recovery, today/week/task retry, exam overlap, weekly review, revision accept/reject, role change, notifications, export, deletion/recovery.
- Content: source/checksum/reviewer/effective date, ten golden personas, sampled task trace, role graph expert review.

Record device/browser/assistive technology, build/content/ruleset versions, scenario, expected/actual result, severity, evidence, tester, and reviewer. Automated axe checks intentionally exclude color contrast because jsdom cannot measure rendered color; manual contrast evidence is mandatory.

## Automated harnesses

- `pnpm load:smoke` requires `LOAD_BASE_URL`; provide `LOAD_PATHS_JSON` with endpoint-specific §29 thresholds, pilot fixture cookie when needed, and at least 2× expected concurrency.
- `pnpm security:smoke` requires `SECURITY_API_URL`, `SECURITY_WEB_URL`, and `SECURITY_ALLOWED_ORIGIN`; a dedicated staging run may set `SECURITY_TEST_RATE_LIMIT=true`.
- Release gate: format, lint, typecheck, tests, builds, Prisma format/validate/migration replay, high-severity audit, load/security reports, restore/provider drills, human matrix, legal/minor decision, content sign-off, and go/no-go owner.

Local automation proves the engineering controls, not that external production, legal, provider, device-lab, or four-week pilot evidence exists. Those items remain explicitly blocked until signed artifacts are attached.
