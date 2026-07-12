# `@exclusions/server`

Cloudflare Worker (Hono) serving the exclusion tracker REST API (`/api/v1/*`), the escalation
cron trigger, push dispatch (Web Push + FCM), and the SIS adapter (mock today, APLIM later). It
also serves the built web client as static assets. See `docs/ARCHITECTURE.md`, `docs/API.md` and
`docs/DATA-MODEL.md` at the repo root for the full contract.

## Dev quickstart

From the repo root (workspaces share one `node_modules` and lockfile):

```bash
npm install

# 1. Apply the D1 migrations to the local (SQLite-backed) dev database.
npm run db:migrate:local -w @exclusions/server

# 2. Start the Worker locally (wrangler dev, top-level/local config: SCHOOL_ID=apprentis-auteuil,
#    SIS_PROVIDER=mock). It serves the API and, if apps/client/dist exists, the web app too.
npm run dev -w @exclusions/server
```

`wrangler dev` needs a few local secrets — create `apps/server/.dev.vars` (git-ignored):

```dotenv
JWT_SECRET=dev-only-jwt-secret-change-me
BOOTSTRAP_SECRET=dev-only-bootstrap-secret
# Optional — only needed to actually send Web Push locally:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# FCM_SERVICE_ACCOUNT={"project_id":"...","client_email":"...","private_key":"..."}
```

Bootstrap the first admin (works exactly once — `409 conflict` once any user exists):

```bash
curl -X POST http://localhost:8787/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: dev-only-bootstrap-secret" \
  -d '{"email":"admin@example.org","displayName":"Dev Admin","password":"correct-horse-battery"}'
```

Then log in (`POST /api/v1/auth/login`) to get an access token, and use it as
`Authorization: Bearer <token>` for everything else. See `docs/API.md` for the full route list,
or the `.claude/skills/debug-worker` skill for a fuller local curl cookbook.

## Tests

```bash
npm run test:run -w @exclusions/server
```

Tests run inside `workerd` via `@cloudflare/vitest-pool-workers`, each test **file** getting its
own freshly migrated, isolated in-memory D1 (`test/apply-migrations.ts` + `vitest.config.ts`).
State persists across `it()` blocks within one file but never leaks across files — so
`POST /auth/bootstrap` (which only ever succeeds once) is called at most once per test file,
typically in a `beforeAll`; every other fixture user is created through the admin-only
`POST /users` endpoint, exactly like a real deployment would after day one (see `test/helpers.ts`).

Tests use `test/wrangler.test.jsonc`, a stripped config with **no static-assets binding** — so
they never depend on `apps/client/dist` existing (that directory is only needed for
`wrangler dev`/`wrangler deploy` to serve the web app; the API works without it).

`@cloudflare/vitest-pool-workers` (as pinned in this repo) configures itself as a Vite plugin
(`cloudflareTest`) rather than the `defineWorkersConfig`/`@cloudflare/vitest-pool-workers/config`
shape described in some older docs/examples — see the comments in `vitest.config.ts` if you need
to bump that dependency.

## Secrets (never committed; set with `wrangler secret put <NAME> --env <school-id>`)

| Secret                | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `JWT_SECRET`          | HS256 signing key for 15-minute access tokens.                                 |
| `BOOTSTRAP_SECRET`    | One-time guard for `POST /auth/bootstrap` (first admin).                       |
| `VAPID_PUBLIC_KEY`    | Web Push VAPID public key (base64url, uncompressed P-256 point).               |
| `VAPID_PRIVATE_KEY`   | Web Push VAPID private key (base64url, 32-byte scalar).                        |
| `FCM_SERVICE_ACCOUNT` | Optional Firebase service-account JSON; unset ⇒ FCM sender is a logging no-op. |

## Deploying a school

Each school (`apprentis-auteuil`, `saint-dominique`, `saint-paul`) is a wrangler environment in
`wrangler.jsonc` with its own D1 database, secrets and worker name — fully isolated (GDPR). The
full runbook (create the D1 database, apply remote migrations, set secrets, deploy, bootstrap the
first admin, smoke test) lives in **`docs/DEPLOYMENT.md`** at the repo root.
