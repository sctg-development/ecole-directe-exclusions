---
name: project-review
description: Project-specific review checklist for this repo — lifecycle invariants, GDPR red flags, auth, i18n, tests, docs sync, free-tier fit. Use it when reviewing any diff or PR in this repository, or as a self-check before declaring a change done.
---

# Project review checklist

Run every item against the diff. Each unchecked item is a finding.

## Lifecycle invariants

- [ ] Every status change goes through `canTransition(from, to, actor, isCreator)` from
      `@exclusions/shared` — a hand-rolled status check (`if (status === "pending") ...` gating
      a write) is a bug, even if currently equivalent.
- [ ] Every transition writes an `exclusion_events` audit row AND stamps the matching `*_at`
      column (`acknowledged_at`, `arrived_at`, `missing_at`, `resolved_at`, `cancelled_at`)
      AND updates `updated_at`.
- [ ] Cron escalation records actor `system` (`actor_id` NULL, `actor_name` 'system').
- [ ] If `packages/shared/src/lifecycle.ts` changed: its tests changed too, and BOTH consumers
      (server transition route + cron; client action buttons) were re-checked.
- [ ] No new terminal-state escape hatches (`resolved`/`cancelled` must stay terminal).

## GDPR red flags

- [ ] New student data fields → challenge data minimization. The contract is: SIS id +
      denormalized display name + class name at incident time (`exclusions`); the synced
      class/student roster (`classes`, `students`, full-replace on every sync); and presence
      observations (`student_presence_events`, pruned after `PRESENCE_RETENTION_DAYS`) — nothing
      more (no birth dates, no photos, no grades, no free-text student profiles).
- [ ] **Any cross-school data path is a bug**: one Worker + one D1 per school. No shared
      tables, no school-id columns implying a shared DB, no aggregation across environments.
- [ ] No PII in logs (`console.log` of request bodies, emails, tokens) and no PII in push
      payload bodies beyond student name + class name.
- [ ] Deleting/retention semantics respected: users are disabled, never hard-deleted;
      exclusions follow the retention procedure in `docs/GDPR.md`.

## Auth & secrets

- [ ] Every new route is behind the auth middleware AND has an explicit role check matching
      the role column in `docs/API.md` (only `auth/login`, `auth/refresh`, `health` and
      `auth/bootstrap` — guarded by `X-Bootstrap-Secret` — are public; `/sync/*` is
      machine-to-machine, guarded by `X-Sync-Api-Key` via `requireSyncApiKey`, not a bearer JWT).
- [ ] Teacher-scoped reads enforce `teacherId` server-side, not client-side.
- [ ] No secrets in code, tests, or `wrangler.jsonc` (`JWT_SECRET`, `BOOTSTRAP_SECRET`, VAPID
      keys, FCM service account are wrangler secrets / `.dev.vars` only; `.dev.vars` is
      gitignored).
- [ ] Server crypto uses WebCrypto only — any `node:crypto` import is a bug.

## i18n

- [ ] No hardcoded French strings in components — all UI text via `apps/client/src/i18n/fr.ts`
      or the shared label constants.
- [ ] Code, comments and docs are English.

## Tests & docs sync

- [ ] The change ships tests (server changes: integration tests inside workerd; client
      changes: component/hook tests; shared changes: unit tests).
- [ ] Any change to request/response shapes updated `packages/shared/src/api.ts` AND
      `docs/API.md` AND both consumers together.
- [ ] `docs/DATA-MODEL.md` updated if migrations changed.

## Free-tier fit

- [ ] No client polling tighter than 15 seconds.
- [ ] No unbounded D1 scans: list queries are paginated (`pageSize` ≤ 100) or bounded by an
      indexed date range; new query patterns hit an existing index or add one.
- [ ] No per-request external calls that could exhaust Workers free-plan limits (push dispatch
      is batched per event, not per subscriber request).
