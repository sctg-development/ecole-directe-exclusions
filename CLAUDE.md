# CLAUDE.md

Real-time classroom exclusion tracking for French schools. A teacher excludes a disruptive
student from class and reports it from a tablet in under 10 seconds; the student-life office
(_vie scolaire_) gets an immediate push notification, acknowledges, and marks the student as
arrived — or the incident escalates to `missing` via a cron trigger. Stack: Cloudflare Worker
(Hono) + D1 per school, React 19 PWA wrapped by Capacitor for Android/iOS. Contract docs:
`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA-MODEL.md`.

## Monorepo map

| Path              | Package              | Purpose                                                                    |
| ----------------- | -------------------- | -------------------------------------------------------------------------- |
| `packages/shared` | `@exclusions/shared` | Domain types, Zod API schemas, lifecycle state machine, constants, schools |
| `apps/server`     | `@exclusions/server` | Worker: REST API `/api/v1/*`, auth, D1 repositories, push, SIS, cron       |
| `apps/client`     | `@exclusions/client` | React PWA + Capacitor shells (Android/iOS)                                 |
| `docs/`           | —                    | Architecture, API contract, data model, deployment, GDPR                   |
| `.claude/skills/` | —                    | Contributor skills: add-api-endpoint, project-review, debug-worker         |

## Commands

Root (run from repo root):

- `npm install` — install all workspaces (see allow-scripts caveat below)
- `npm run typecheck` — `tsc --noEmit` in every workspace
- `npm test` — runs `test:run` (vitest, non-watch) in every workspace
- `npm run lint` / `npm run format` / `npm run format:check` — eslint / prettier write / check
- `npm run build` — build every workspace that has a build script

Per workspace (`npm run <script> -w <package>`):

| Script             | `@exclusions/shared` | `@exclusions/server`                      | `@exclusions/client` |
| ------------------ | -------------------- | ----------------------------------------- | -------------------- |
| `dev`              | — (no build/dev)     | `wrangler dev`                            | `vite`               |
| `test:run`         | vitest run           | vitest run (inside workerd)               | vitest run           |
| `typecheck`        | `tsc --noEmit`       | `tsc --noEmit`                            | `tsc --noEmit`       |
| `build`            | — (ships .ts source) | `wrangler deploy --dry-run --outdir dist` | `vite build`         |
| `db:migrate:local` | —                    | `wrangler d1 migrations apply DB --local` | —                    |

## Rules an agent MUST know

- **`packages/shared` is the single source of truth**: domain types (`domain.ts`), Zod API
  schemas (`api.ts`), lifecycle state machine (`lifecycle.ts`), constants, school registry.
  Never redefine these — always `import from "@exclusions/shared"`. Any lifecycle change
  requires updating `shared` + its tests + both consumers (server transition endpoint & cron,
  client action buttons).
- **Lifecycle**: all status changes go through `canTransition(from, to, actor, isCreator)`.
  Never hand-roll status checks. Every transition appends an `exclusion_events` row and stamps
  the matching `*_at` column (see `docs/DATA-MODEL.md`).
- **API changes are a four-place edit**: `packages/shared/src/api.ts` (schema + types) +
  `docs/API.md` + server route (`apps/server/src/routes/`) + client endpoint
  (`apps/client/src/api/endpoints.ts`). Use the `add-api-endpoint` skill.
- **Language split**: code, comments and docs are English. End-user UI strings and notification
  texts are French and live ONLY in `apps/client/src/i18n/fr.ts` (client) — never hardcode
  French in components. Shared French labels (reasons, statuses, roles) come from
  `packages/shared/src/constants.ts` because the server reuses them in push payloads.
- **WebCrypto only on the server**: the Worker has no `node:crypto` — use `crypto.subtle`,
  `crypto.randomUUID()`, `crypto.getRandomValues()` (PBKDF2, HS256, VAPID all via WebCrypto).
- **GDPR isolation**: every school runs a fully independent Worker + D1 (wrangler environments
  in `apps/server/wrangler.jsonc`). Never add cross-school code paths, shared databases, or
  aggregation across schools. Student data is minimal: SIS id + denormalized display name.
- **TS strict specifics** (`tsconfig.base.json`): `verbatimModuleSyntax` → use `import type`
  for type-only imports; `exactOptionalPropertyTypes` → `foo?: string` rejects an explicit
  `undefined`, so build objects conditionally instead of assigning `undefined`;
  `noUncheckedIndexedAccess` → indexed reads are `T | undefined`.
- **Tests are mandatory for every change** (vitest). Server tests run inside workerd via
  `@cloudflare/vitest-pool-workers` — real D1/bindings behavior, no Node globals.
- **npm allow-scripts caveat**: the root `package.json` `allowScripts` field pins which
  postinstall scripts may run (`esbuild`, `sharp`, `workerd`). If native binaries are missing
  (e.g. "workerd binary not found", esbuild version mismatch), run
  `npm approve-scripts esbuild workerd sharp && npm rebuild`.
- Style: double quotes, semicolons, trailing commas, 100-col Prettier. License MIT.
- Free-tier discipline: no client polling tighter than 15 s, no unbounded D1 scans — always
  paginate (`page`/`pageSize`, max 100) or bound by date range.
