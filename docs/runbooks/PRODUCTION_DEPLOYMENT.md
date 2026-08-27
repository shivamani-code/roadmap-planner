# Production deployment

## Release scope

The curriculum release covers 17 JNTUH R25 B.Tech branches for students admitted from academic year 2025-26 at non-autonomous affiliated colleges. Four branches are explicitly partial where JNTUH has published only I–II year syllabi. Do not enroll students from autonomous colleges against these datasets; their college-specific curricula require separate reviewed imports.

## Required external services

- TLS-terminating ingress or load balancer for the web, admin, and API origins.
- PostgreSQL 17 with encrypted storage, automated backups, point-in-time recovery, and restore drills.
- Transactional email gateway implementing the StudentOS magic-link request contract and returning `{ "messageId": "..." }`.
- Secret manager for database credentials, `SESSION_SECRET`, and gateway tokens.
- Central logs/metrics with alerting for readiness, 5xx rate, worker failures, database saturation, and email delivery.

## Build and start

1. Copy `.env.production.example` to a secret-backed deployment environment and replace every placeholder.
2. Validate the official curriculum pack with `pnpm content:validate:production`.
3. Run the full release gate with `pnpm check` and `pnpm audit --audit-level high`.
4. Build and start the stack with `docker compose --env-file .env.production -f compose.production.yml up --build -d`.
5. Confirm API readiness at `/api/v1/health/ready`, request a real mailbox sign-in link, consume it once, and verify replay is rejected.
6. Run the idempotent `pnpm release:seed` initializer through separately configured content-editor and content-reviewer identities. It publishes missing curriculum, career, project, and mapping datasets without generating student data. Record review evidence and impact regression results before publication.

## Email gateway contract

The API sends an authenticated JSON request containing `template`, `to`, `subject`, `actionUrl`, and `expiresInMinutes`. The gateway must render the URL as a one-use sign-in action, avoid logging query parameters, and respond with a JSON `messageId`. Configure SPF, DKIM, DMARC, bounce/complaint handling, and mailbox rendering tests before public launch.

## Go-live gates outside the repository

The codebase cannot prove legal approval, content expert sign-off, penetration testing, backup restoration time, DNS/email reputation, manual WCAG/device testing, or the required measured student pilot. Attach those artifacts to the launch evidence before moving from controlled pilot to public availability.
