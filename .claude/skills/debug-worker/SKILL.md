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
npx wrangler d1 execute DB --local --command "SELECT id, name, level, student_count, synced_at FROM classes"
npx wrangler d1 execute DB --local --command "SELECT id, first_name, last_name, class_id FROM students WHERE class_id = '...'"
npx wrangler d1 execute DB --local --command "SELECT student_id, present, observed_at FROM student_presence_events ORDER BY observed_at DESC LIMIT 20"
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

Two more secrets are optional: `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON for
Android/iOS push) — when unset the FCM sender is a no-op that logs; and `SYNC_API_KEY` (any
string) — when unset, `/api/v1/sync/*` always returns `401` (see `wrangler.jsonc`). Also set
`PRESENCE_RETENTION_DAYS` as a plain var in `wrangler.jsonc` if you need to test pruning with a
non-default window — it's not a secret.

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

### SIS sync (machine-to-machine, requires `SYNC_API_KEY` in `.dev.vars`)

Auth is `X-Sync-Api-Key`, not a bearer token — call order matters (classes, then students, then
presence):

```sh
export SYNC_KEY=local-sync-api-key   # must match SYNC_API_KEY in .dev.vars

curl -s -X PUT http://localhost:8787/api/v1/sync/classes \
  -H "X-Sync-Api-Key: $SYNC_KEY" -H "Content-Type: application/json" \
  -d '{"classes":[{"id":"cls-1","name":"Terminale A","level":"Terminale","studentCount":1}]}'

curl -s -X PUT http://localhost:8787/api/v1/sync/students \
  -H "X-Sync-Api-Key: $SYNC_KEY" -H "Content-Type: application/json" \
  -d '{"students":[{"id":"stu-1","firstName":"Ada","lastName":"Lovelace","classId":"cls-1","className":"Terminale A"}]}'

curl -s -X POST http://localhost:8787/api/v1/sync/presence \
  -H "X-Sync-Api-Key: $SYNC_KEY" -H "Content-Type: application/json" \
  -d '{"observations":[{"studentId":"stu-1","present":true,"observedAt":"2026-09-01T08:00:00Z"}]}'

# Read it back (bearer JWT, vie-scolaire/admin only)
curl -s http://localhost:8787/api/v1/classes/cls-1/presence -H "Authorization: Bearer $TOKEN"
```

For a realistic dataset instead of one-off fixtures, `scripts/seed-test-school.mjs` pushes a
checked-in fixture (8 classes, 247 students, 12 teachers) through this exact flow in one shot:

```sh
ADMIN_EMAIL=admin@example.org ADMIN_PASSWORD=correct-horse-battery \
  SYNC_API_KEY=$SYNC_KEY npm run seed:test-school -w @exclusions/server
```

`PUT /sync/classes` and `PUT /sync/students` are full-replace: set `SIS_PROVIDER=synced` in
`wrangler.jsonc` to have `GET /classes`/`GET /classes/:id/students` read the synced roster
instead of the mock; `GET /classes/:id/presence` always reads the synced presence log regardless
of `SIS_PROVIDER`.

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
