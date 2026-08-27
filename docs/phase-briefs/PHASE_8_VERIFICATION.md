# Phase 8 Verification Report

**Date:** 25 August 2026  
**Decision:** Ready for Phase 9 AI communication and notifications.

## Invariants verified

- The adaptive load signal ignores one-week noise, uses only the latest four signals, applies EWMA alpha 0.4, and clamps both reductions and increases within declared availability.
- A student cannot submit two reviews for the same calendar week even when the first review activates a new roadmap version and supersedes its planning-week record.
- Confirmed overlapping exam periods resolve by safety priority; unconfirmed inferred periods appear only as confirmation requests.
- Semester mode schedules no more than 20% career continuity, at most two career sessions, and no career session over 45 minutes per day. All weekly output remains within allocatable capacity.
- Manual rescheduling cannot exceed exam-mode career share, daily limit, or session count.
- Deferred work uses future spare capacity and reports deadline impact instead of creating a post-exam catch-up spike.
- Weekly revisions auto-activate only when the diff is within 10% and does not move milestone dates. Exam, material, role, and content previews remain `READY` until explicit acceptance.
- Activation uses the expected active version, blocks in-progress/partial work, supersedes the active revision atomically, and rejects stale or cross-account requests.
- Completed task history and completion counts remain unchanged across weekly, material, and role revisions. Retained tasks reference the original task/completion rather than copying evidence.
- Role switching preserves shared canonical evidence, writes a new career-goal version, removes role-mismatched project readiness, and recalculates gates against the new active role.
- Rejecting a preview preserves the active roadmap; the next preview receives a new monotonic version rather than colliding with the rejected version.
- The legacy onboarding goal endpoint cannot bypass revision consent once an active roadmap exists.

## Automated gate

- Planning package: five test files and 27 deterministic/property tests pass, including four-week adaptation, overlap resolution, exam caps, deferred placement, locked-history diffing, and consent thresholds.
- Database package: all migrations apply in order to embedded PostgreSQL; constraints and generated Prisma types pass four migration/adapter tests.
- API: typecheck, lint, and six tests pass. The connected E2E flow covers curriculum → role → assessment → gap → roadmap → task/project evidence → exam mode → weekly revision → material consent → role migration → rejection/version continuity, plus negative authorization and concurrency cases.
- Web: typecheck, lint, five component/utility tests, and the Next.js production build pass. The build includes 20 routes, including `/review`, `/calendar`, and `/recalculate`.
- The monorepo-wide formatting, lint, typecheck, test, build, migration, and dependency-audit result is recorded at the final phase gate.

## Human evidence still required

- Pilot students must validate whether the EWMA explanation and grouped revision diff are understandable without coaching.
- Institutions must validate official exam calendars and any template provenance before production publication.
- Keyboard, screen-reader, zoom/reflow, device/browser, contrast, and consent-comprehension audits remain consolidated into the Phase 10 launch gate.
