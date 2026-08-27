# Local development runbook

## Prerequisites

- Node.js 22 or later (CI uses Node.js 24)
- pnpm 11.1.2
- PostgreSQL for the full API + worker flow

Install dependencies and generate the Prisma client:

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
Copy-Item .env.example .env
```

Replace `SESSION_SECRET` with at least 32 random characters. Keep `.env` uncommitted.

## Full local stack with PostgreSQL

Create an empty `studentos` database using your PostgreSQL administration workflow, then set `DATABASE_URL` in `.env`. Apply the checked-in migration with Prisma:

```powershell
pnpm --filter @studentos/database exec prisma migrate deploy
pnpm dev
```

Services:

| Service     | Address                                     |
| ----------- | ------------------------------------------- |
| Student web | `http://localhost:3000`                     |
| Admin shell | `http://localhost:3001`                     |
| API         | `http://localhost:4000/api/v1`              |
| OpenAPI     | `http://localhost:4000/api/docs`            |
| Liveness    | `http://localhost:4000/api/v1/health/live`  |
| Readiness   | `http://localhost:4000/api/v1/health/ready` |

## Database-free API smoke test

PGlite is available only for automated verification and a single-process local smoke test. It must not be used in production. Start the API with an isolated local database:

```powershell
$env:DATABASE_MODE = "pglite"
$env:DATABASE_DIR = "./packages/database/.local/api-smoke"
$env:ALLOW_DEV_AUTH = "true"
$env:SESSION_SECRET = "local-development-secret-at-least-32-characters"
pnpm --filter @studentos/api dev
```

In another terminal, start the web application:

```powershell
$env:NEXT_PUBLIC_API_URL = "http://localhost:4000/api/v1"
pnpm --filter @studentos/web dev
```

The development-only sign-in flow returns a one-use debug link. Runtime configuration prevents that behavior in production.

To initialize a clean local database with the same non-synthetic release catalog used by the deployment workflow, configure two distinct local content identities and run:

```powershell
$env:DEV_CONTENT_EDITOR_EMAIL = "content-editor@studentos.local"
$env:DEV_CONTENT_REVIEWER_EMAIL = "content-reviewer@studentos.local"
pnpm content:validate:production
pnpm release:seed
```

The initializer publishes curriculum, career, project, and mapping data only. It does not create a student profile or pre-complete onboarding.

## Optional communication gateways

AI wording and email are optional enhancements. With no gateway variables, deterministic guidance and in-app notifications continue to work.

Configure both members of a pair or neither; startup rejects partial secret configuration:

```powershell
$env:AI_GATEWAY_URL = "https://internal-ai-gateway.example/v1/generate"
$env:AI_GATEWAY_TOKEN = "secret-manager-token"
$env:AI_PROVIDER_NAME = "approved-provider"
$env:AI_MODEL = "approved-model-version"

$env:EMAIL_GATEWAY_URL = "https://internal-email-gateway.example/v1/send"
$env:EMAIL_GATEWAY_TOKEN = "secret-manager-token"
```

AI calls run only after per-user consent and through worker outbox jobs. The internal AI gateway must accept the structured request and return `{ output, inputTokens?, outputTokens? }`; `output` must satisfy the supplied JSON Schema. The email gateway must return `{ messageId }`. Never place provider tokens in client variables or committed files.

## Quality gate

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level high
```

Never add secrets, raw authentication tokens, email addresses, or event payloads to logs. The shared logger redacts those fields by default.
