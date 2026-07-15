# Deployment guide

One school = one fully independent Cloudflare stack: its own Worker, its own D1 database, its own
secrets. Schools are wrangler **environments** of the same codebase, declared in
`apps/server/wrangler.jsonc`:

| Environment (`--env`) | School                            |
| --------------------- | --------------------------------- |
| `apprentis-auteuil`   | Fondation des Apprentis d'Auteuil |
| `saint-dominique`     | Lycée Saint Dominique             |
| `saint-paul`          | Lycée Saint Paul                  |

Run the full runbook below **once per school**. Nothing is shared between schools — that is the
point (GDPR isolation, see [GDPR.md](./GDPR.md)).

## Prerequisites

- A Cloudflare account (the free plan is enough — see the fit table at the bottom).
- Node.js >= 22, repo cloned, `npm install` done.
- Authenticated wrangler: `npx wrangler login` (interactive), or export `CLOUDFLARE_API_TOKEN`
  and `CLOUDFLARE_ACCOUNT_ID` for non-interactive use.
- For Android/iOS push: a Firebase project (see [MOBILE.md](./MOBILE.md)).

All commands below run from `apps/server` unless noted. Replace `<school-id>` with the
environment name (e.g. `saint-dominique`).

## 1. Create the D1 database

```bash
cd apps/server
npx wrangler d1 create exclusions-<school-id>
```

The command prints a `database_id`. Paste it into the matching environment's `d1_databases`
binding in `apps/server/wrangler.jsonc` (binding name `DB`). Commit that change — database IDs
are not secrets.

## 2. Apply migrations (remote)

```bash
npx wrangler d1 migrations apply DB --env <school-id> --remote
```

Re-run this after every new migration in `apps/server/migrations/` and **before** deploying the
Worker that needs it.

## 3. Set the secrets

Each environment needs up to six secrets. Set each one with:

```bash
npx wrangler secret put <NAME> --env <school-id>   # then paste the value
```

| Secret                | How to generate the value                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`          | `openssl rand -base64 32` — signs the HS256 access tokens. Unique per school.                                                                                                                                                  |
| `BOOTSTRAP_SECRET`    | `openssl rand -base64 32` — one-time guard for creating the first admin (step 5).                                                                                                                                              |
| `VAPID_PUBLIC_KEY`    | `node scripts/generate-vapid-keys.mjs` (from the repo root) — use the printed public key. Generate **one pair per school** and keep the pair together.                                                                         |
| `VAPID_PRIVATE_KEY`   | Same script run — use the printed private key.                                                                                                                                                                                 |
| `FCM_SERVICE_ACCOUNT` | Firebase console → _Project settings → Service accounts → Generate new private key_ → downloads a JSON file. The secret is that JSON **on a single line**: `jq -c . < service-account.json`. Needed for Android/iOS push only. |
| `SYNC_API_KEY`        | `openssl rand -base64 32` — shared secret the external SIS-sync worker sends as `X-Sync-Api-Key`. Optional: leave unset until a sync worker actually exists, which disables `/api/v1/sync/*` (every call gets `401`).          |

Notes:

- Secrets live only in Cloudflare — never in git, never in `wrangler.jsonc`.
- Rotating `JWT_SECRET` instantly invalidates all access tokens (users re-login via their
  refresh token flow at worst).
- If a school does not use mobile apps yet, you can defer `FCM_SERVICE_ACCOUNT`; web push only
  needs the VAPID pair.
- `PRESENCE_RETENTION_DAYS` (default `30`) is a plain `var` in `wrangler.jsonc`, not a secret —
  adjust it per school like `ESCALATION_MINUTES`/`RETENTION_MONTHS`.

## 4. Build and deploy

The Worker serves the web client as static assets from `apps/client/dist`, so build the client
first (from the repo root):

```bash
npm run build -w @exclusions/client
cd apps/server
npx wrangler deploy --env <school-id>
```

Wrangler prints the deployed URL (a `workers.dev` subdomain unless you configured a custom
domain).

Alternatively, use the **Deploy** GitHub Actions workflow (_Actions → Deploy → Run workflow_,
pick the school). It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token created from
the "Edit Cloudflare Workers" template, plus **D1 Edit** permission) and `CLOUDFLARE_ACCOUNT_ID`.
The workflow applies pending migrations, then deploys — one school per run.

## 5. Bootstrap the first admin

One-time per school. The endpoint refuses to run once an admin exists.

```bash
curl -X POST https://<worker-url>/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: <the BOOTSTRAP_SECRET you set>" \
  -d '{"email":"cpe@school.example","displayName":"Prénom Nom","password":"<strong password, 10+ chars>"}'
```

The admin then logs into the web app and creates the teacher and vie-scolaire accounts
(_Administration → Utilisateurs_).

## 6. Smoke test

```bash
curl https://<worker-url>/api/v1/health
# → {"status":"ok","school":{"id":"<school-id>","name":"..."},"version":"..."}
```

Then check, in the web app: login works, classes load (mock SIS), creating a test exclusion
triggers a push on a subscribed vie-scolaire device, and the exclusion appears on the dashboard.
Cancel the test exclusion afterwards so the stats stay clean.

## Free-tier fit

Sized for fewer than 10 exclusions/day/school; the dominant traffic is dashboard polling and
static assets. Rough daily numbers per school versus Cloudflare free-plan limits:

| Resource        | Free-plan limit       | Expected usage         | Headroom |
| --------------- | --------------------- | ---------------------- | -------- |
| Worker requests | 100,000 / day         | < 5,000 / day          | ~20×     |
| Worker CPU time | 10 ms / invocation    | a few ms typical       | OK       |
| D1 rows read    | 5,000,000 / day       | < 50,000 / day         | ~100×    |
| D1 rows written | 100,000 / day         | < 1,000 / day          | ~100×    |
| D1 storage      | 5 GB total            | a few MB / school year | huge     |
| Cron trigger    | supported (free plan) | 288 runs / day (5 min) | OK       |

Each school being its own Worker, limits apply per school — usage does not add up across schools
in a way that matters here.

## Custom domain (optional)

The `workers.dev` URL works fine. To use a school domain (e.g. `exclusions.school.example`), add
the zone to Cloudflare, then attach a custom domain to the Worker (dashboard: _Worker → Settings →
Domains & Routes_, or a `routes`/`custom_domain` entry in the environment's `wrangler.jsonc`
section) and redeploy. Remember to use the new URL in the mobile apps' configuration.

## Updating a deployment

```bash
git pull
npm ci
npm run build -w @exclusions/client
cd apps/server
npx wrangler d1 migrations apply DB --env <school-id> --remote   # no-op if none pending
npx wrangler deploy --env <school-id>
```

Or run the Deploy workflow again. Repeat per school — schools can run different versions
temporarily; migrations only ever apply to that school's own database.
