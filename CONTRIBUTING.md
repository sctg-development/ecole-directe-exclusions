# Contributing

Thanks for helping make sure no excluded student ever wanders a school unsupervised. This guide
covers the dev environment, project conventions and the PR process. Please also read the
[architecture overview](./docs/ARCHITECTURE.md) first — it is short and explains every design
decision you will bump into.

## Dev environment

Prerequisites: **Node.js >= 22** and npm. No other runtime is needed — the server runs in
`wrangler dev` (workerd) and the database is a local SQLite file managed by wrangler.

```bash
git clone https://github.com/sctg-development/ecole-directe-exclusions.git
cd ecole-directe-exclusions
npm install
```

> **npm lifecycle scripts**: the root `package.json` has an `allowScripts` field listing the only
> packages allowed to run install scripts (`esbuild`, `sharp`, `workerd`). On npm >= 11.16 (where
> install scripts are blocked by default), if a dependency bump adds or changes a version pin you
> may need to run `npm approve-scripts` and approve those packages before `npm install` succeeds.

Then set up the local database and secrets:

```bash
npm run db:migrate:local -w @exclusions/server
# Create apps/server/.dev.vars (gitignored) with at least:
#   JWT_SECRET=<any random string for dev>
#   BOOTSTRAP_SECRET=<any random string for dev>
# For web-push testing, add the VAPID keys from: node scripts/generate-vapid-keys.mjs
```

## Workspace layout

npm workspaces monorepo:

| Workspace            | Path              | What lives there                                                   |
| -------------------- | ----------------- | ------------------------------------------------------------------ |
| `@exclusions/shared` | `packages/shared` | Domain types, Zod schemas, lifecycle state machine, constants      |
| `@exclusions/server` | `apps/server`     | Cloudflare Worker (Hono + D1): API, auth, push, SIS adapters, cron |
| `@exclusions/client` | `apps/client`     | React PWA + Capacitor Android/iOS shells                           |

`@exclusions/shared` ships TypeScript sources directly (no build step) — Vite, wrangler/esbuild
and Vitest consume `.ts` workspace dependencies natively.

## Running each package

```bash
# Server — API on http://localhost:8787
npm run dev -w @exclusions/server
npm run test:run -w @exclusions/server        # Vitest inside workerd
npm run db:migrate:local -w @exclusions/server

# Client — web app on http://localhost:5173
npm run dev -w @exclusions/client
npm run test:run -w @exclusions/client
npm run build -w @exclusions/client           # production build into apps/client/dist

# Shared
npm run test:run -w @exclusions/shared

# Whole repo (what CI runs)
npm run lint && npm run format:check && npm run typecheck && npm test
```

Build order matters for the server: `npm run build -w @exclusions/server` is a wrangler dry run
whose config serves `apps/client/dist` as static assets — **build the client first**.

## Coding standards

- **TypeScript strict**, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and
  `verbatimModuleSyntax` (use `import type` for type-only imports). No `any` without a comment
  explaining why.
- **`@exclusions/shared` is the single source of truth** for domain types, API schemas and the
  exclusion lifecycle. Never redefine its types or re-implement `canTransition` logic in the
  server or client — import it.
- **English code, French UI**: code, comments, docs, commit messages are English. End-user
  strings (UI labels, push notification texts) are French and live in the client's i18n module
  and the shared constants (`EXCLUSION_REASONS`, `EXCLUSION_STATUS_LABELS_FR`, …) — never
  hardcoded in components.
- **Formatting**: Prettier (double quotes, semicolons, trailing commas, 100 columns) and ESLint.
  Run `npm run format` before committing; CI fails on `format:check`.
- **Privacy by design**: store no student data beyond the SIS id and display name captured at
  incident time; keep per-school isolation intact (no cross-school code paths). See
  [docs/GDPR.md](./docs/GDPR.md).

## Tests

Every feature needs **unit tests and integration tests**:

- Shared: pure unit tests (lifecycle, schemas).
- Server: integration tests run inside workerd via `@cloudflare/vitest-pool-workers`, hitting the
  real Hono app and a real (local) D1.
- Client: component tests with Testing Library and happy-dom.

Bug fixes come with a regression test. `npm test` at the root runs every workspace.

## Pull request process

1. Fork/branch from `main`. Keep PRs focused — one topic per PR.
2. Make sure `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` pass.
3. Update docs (`docs/`, README) when behavior or commands change.
4. Fill in the PR template checklist; CI must be green before review.
5. A maintainer reviews and squash-merges. Deployments to schools are manual and separate
   (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)) — merging to `main` never auto-deploys.

## Claude Code skills

The `.claude/` directory ships skills for [Claude Code](https://claude.com/claude-code) that
encode this project's conventions (lifecycle changes, adding endpoints, migrations, i18n…). If
you use Claude Code, they are picked up automatically and are the fastest way to get a conformant
change; if you don't, they are still readable checklists worth skimming.

## Security issues

Do **not** open a public issue for vulnerabilities — see [SECURITY.md](./SECURITY.md).
