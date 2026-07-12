---
name: debug-worker
description: How to run and debug the Cloudflare Worker server locally — wrangler dev, local D1 migrations and inspection, vitest-pool-workers failure triage, .dev.vars secrets, web-push testing, curl cookbook, and cron trigger testing. Use it when the server misbehaves locally, a server test fails, or an agent needs to exercise the API by hand.
---

# Debug the Worker locally

All commands below run against `@exclusions/server` (`apps/server/`).

## Run the server

```sh
npm run db:migrate:local -w @exclusions/server   # apply D1 migrations to the local sqlite
npm run dev -w @exclusions/server                # wrangler dev → http://localhost:8787
```

`wrangler dev` picks up secrets from `apps/server/.dev.vars` (see below) and vars/bindings from
`apps/server/wrangler.jsonc`. Local D1 state lives under `apps/server/.wrangler/state/` —
delete that directory for a clean slate (then re-run migrations).

## Inspect the local D1 database

From `apps/server/`:

```sh
npx wrangler d1 execute DB --local --command "SELECT id, status, student_name FROM exclusions ORDER BY created_at DESC LIMIT 10"
npx wrangler d1 execute DB --local --command "SELECT * FROM exclusion_events WHERE exclusion_id = '...'"
npx wrangler d1 execute DB --local --command "SELECT email, role, disabled FROM users"
```

`DB` is the binding name from `wrangler.jsonc`. Columns are `snake_case` (see
`docs/DATA-MODEL.md`); the repository layer maps to `camelCase`.

## Reading vitest-pool-workers failures

Server tests (`npm run test:run -w @exclusions/server`) execute **inside workerd** via
`@cloudflare/vitest-pool-workers`, not in Node:

- `console.log` from handlers and tests appears inline in the vitest output — use it freely.
- Node globals/modules (`process`, `node:crypto`, `Buffer`) do not exist; such a failure means
  the code under test is wrong (server is WebCrypto-only), not the test setup.
- Stack traces point into workerd's bundled build; trust the file:line, ignore the wrapper
  frames.
- "workerd binary not found" or an esbuild version mismatch after install → the postinstall
  scripts were blocked by the root `allowScripts` policy. Fix with:
  `npm approve-scripts esbuild workerd sharp && npm rebuild`.
- Each test file gets isolated storage; cross-test state leakage usually means a module-level
  cache in the server code.

## Secrets: `.dev.vars` format

Create `apps/server/.dev.vars` (gitignored, never commit). All four secrets are required for a
full local run; web push needs **real** VAPID keys (the WebCrypto signing fails on garbage):

```ini
JWT_SECRET=any-long-random-string-for-local-dev
BOOTSTRAP_SECRET=local-bootstrap-secret
VAPID_PUBLIC_KEY=BASE64URL_UNCOMPRESSED_P256_PUBLIC_KEY
VAPID_PRIVATE_KEY=BASE64URL_P256_PRIVATE_KEY
```

A fifth secret, `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON for Android/iOS push), is
optional — when unset the FCM sender is a no-op that logs (see `wrangler.jsonc`).

Generate a valid VAPID pair once with `npx web-push generate-vapid-keys` (one-off, not a
project dependency). To receive an actual notification, run the client
(`npm run dev -w @exclusions/client`), log in as a vie-scolaire user, allow notifications, then
create an exclusion as a teacher.

## Curl cookbook

Base URL `http://localhost:8787/api/v1`. The bootstrap route is guarded by the
`X-Bootstrap-Secret` header (`BOOTSTRAP_SECRET`) and creates the first admin; it answers
`409 conflict` once any user exists (see `docs/API.md`).

```sh
# 0. Bootstrap the first admin (empty DB only)
curl -s -X POST http://localhost:8787/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: local-bootstrap-secret" \
  -d '{"email":"admin@example.org","displayName":"Admin","password":"changeme-10chars"}'

# 1. Login → capture tokens
curl -s -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.org","password":"changeme-10chars"}'
export TOKEN=...   # accessToken from the response (15 min TTL)

# 2. Pick a class and a student (mock SIS, deterministic per SCHOOL_ID)
curl -s http://localhost:8787/api/v1/classes -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8787/api/v1/classes/CLASS_ID/students -H "Authorization: Bearer $TOKEN"

# 3. Create an exclusion (comment required when reason is "other")
curl -s -X POST http://localhost:8787/api/v1/exclusions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"STUDENT_ID","classId":"CLASS_ID","reason":"disruption"}'

# 4. Transition it (validated by canTransition; invalid → 409 invalid_transition)
curl -s -X POST http://localhost:8787/api/v1/exclusions/EXCLUSION_ID/transition \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"to":"acknowledged"}'

# 5. Live dashboard view
curl -s http://localhost:8787/api/v1/exclusions/active -H "Authorization: Bearer $TOKEN"
```

Errors always look like `{ "error": { "code": "...", "message": "..." } }`.

## Testing the cron trigger (escalation to `missing`)

```sh
npx wrangler dev --test-scheduled          # from apps/server/
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

The `cron` query param must match a cron expression configured in `wrangler.jsonc`,
URL-encoded (spaces → `+`; e.g. `*/5 * * * *` → `cron=*%2F5+*+*+*+*`). To see an escalation:
create an exclusion, backdate it past `ESCALATION_MINUTES` directly in D1
(`UPDATE exclusions SET created_at = '...' WHERE id = '...'` via `wrangler d1 execute --local`),
trigger the cron, then check the exclusion status and its `exclusion_events` row with actor
`system`.
