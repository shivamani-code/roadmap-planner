# StudentOS

StudentOS is a curriculum-aware academic and career planning platform for B.Tech students. The implementation baseline is [`PRODUCT_DEVELOPMENT_SPEC.md`](./PRODUCT_DEVELOPMENT_SPEC.md).

## Current status

Phases 0–10 are complete at the engineering level. The connected product covers reviewed curriculum and career knowledge, onboarding, conservative gap analysis, deterministic capacity-safe planning, evidence/projects/readiness, exam-aware adaptation, consented revisions, bounded AI wording, opt-in notifications, CSRF/rate-limit/security headers, self-service export/deletion/recovery, retention/tombstone purge, pilot feedback/metrics, offline guidance, and accessibility/operational gates. It runs as a pnpm/Turborepo monorepo with Next.js web/admin applications, a NestJS API, a transactional outbox worker, shared domain packages, Prisma 7/PostgreSQL persistence, passwordless development authentication, and automated quality gates.

Key evidence:

- [`Phase 0 brief`](./docs/phase-briefs/PHASE_0_PRODUCT_ARCHITECTURE.md)
- [`Phase 0 verification`](./docs/phase-briefs/PHASE_0_VERIFICATION.md)
- [`Phase 1 brief`](./docs/phase-briefs/PHASE_1_PLATFORM_FOUNDATIONS.md)
- [`Phase 1 verification`](./docs/phase-briefs/PHASE_1_VERIFICATION.md)
- [`Phase 7 delivery`](./docs/phase-briefs/PHASE_7_PROGRESS_PROJECTS_READINESS.md)
- [`Phase 7 verification`](./docs/phase-briefs/PHASE_7_VERIFICATION.md)
- [`Phase 8 delivery`](./docs/phase-briefs/PHASE_8_ADAPTATION_EXAM_MODE.md)
- [`Phase 8 verification`](./docs/phase-briefs/PHASE_8_VERIFICATION.md)
- [`Phase 9 delivery`](./docs/phase-briefs/PHASE_9_AI_NOTIFICATIONS.md)
- [`Phase 9 verification`](./docs/phase-briefs/PHASE_9_VERIFICATION.md)
- [`Phase 10 delivery`](./docs/phase-briefs/PHASE_10_HARDENING_PILOT.md)
- [`Phase 10 verification`](./docs/phase-briefs/PHASE_10_VERIFICATION.md)
- [`Local development runbook`](./docs/runbooks/LOCAL_DEVELOPMENT.md)
- [`Domain vocabulary`](./docs/architecture/DOMAIN_VOCABULARY.md)
- [`Architecture decisions`](./docs/adr/)
- [`Content contracts`](./content/README.md)
- [`Threat model`](./docs/threat-models/PHASE_0_STRIDE.md)

The release catalog in `content/production` includes 17 official-source-normalized JNTUH R25 B.Tech branches, 80 career skills, 33 versioned graduate role tracks across 15 domains, 160 learning/practice units, 33 role-specific portfolio capstones, and 636 reviewed curriculum-to-career mappings. Thirteen branches have complete eight-semester course structures. Biotechnology, Mining Engineering, CSE (Networks), and CSE (IoT and Cyber Security including Blockchain) are marked partial because JNTUH has currently published only their I–II year syllabi; StudentOS uses those published semesters and never invents later subjects. Runtime initialization publishes only non-synthetic datasets and never fabricates a student's profile, assessment, roadmap, or progress. Synthetic fixtures remain test-only and cannot be published in production.

## Verify the monorepo

Requirements: Node.js 22 or later and pnpm 11.1.2.

```powershell
pnpm install --frozen-lockfile
pnpm check
```

See the local development runbook for API/web startup and authentication smoke testing.

## Deployment targets

This monorepo contains two different Next.js applications:

- `apps/web` is the student-facing StudentOS product.
- `apps/admin` is the internal content-operations console.

For a Vercel student-frontend project, set **Root Directory** to `apps/web`, keep **Include source files outside of the Root Directory** enabled for workspace packages, and set `NEXT_PUBLIC_API_URL` to the public API URL ending in `/api/v1`. The checked-in `apps/web/vercel.json` supplies the workspace-aware install and build commands.

The frontend is not a standalone deployment. Deploy `apps/api` and PostgreSQL separately, configure the production variables in `.env.production.example`, run database migrations and the release seed, and then point the web project at that API. The complete container deployment is documented in [`docs/runbooks/PRODUCTION_DEPLOYMENT.md`](./docs/runbooks/PRODUCTION_DEPLOYMENT.md).
