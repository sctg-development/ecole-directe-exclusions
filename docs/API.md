# API contract

All endpoints are prefixed with `/api/v1`. Request/response bodies are JSON and validated with
the Zod schemas in `@exclusions/shared` (`packages/shared/src/api.ts`) — **that package is the
source of truth**; this document is the human-readable companion. A machine-readable OpenAPI
3.2.0 document, generated from those same schemas, is served at `GET /api/v1/openapi.json` (no
auth required).

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` on every route except `POST /auth/bootstrap`
  (guarded by `X-Bootstrap-Secret`), `POST /auth/login`, `POST /auth/refresh`, `GET /health`,
  and the `/sync/*` routes (guarded by `X-Sync-Api-Key`, see "SIS sync" below).
- **Errors**: `{ "error": { "code": string, "message": string } }` with a matching HTTP status.
  Codes include `invalid_credentials`, `unauthorized`, `forbidden`, `not_found`,
  `validation_error`, `invalid_transition`, `rate_limited`, `conflict`, `internal`.
- **Dates**: ISO 8601 UTC strings (`2026-07-09T08:30:00.000Z`).
- **IDs**: opaque strings (UUID v4 generated with `crypto.randomUUID()`).
- **Pagination**: `?page=1&pageSize=25` → `{ items, page, pageSize, total }`.
- **CORS**: enabled on every `/api/v1/*` route for the Capacitor native shells' origins
  (`capacitor://localhost` on iOS, `https://localhost` on Android — see
  `apps/server/src/index.ts`, `ALLOWED_CLIENT_ORIGINS`, and `docs/MOBILE.md`). The web PWA is
  served same-origin by the same Worker and never needs it.

## Auth

| Method & path          | Role | Body → Response                                                                                                                                                                                      |
| ---------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/bootstrap` | —    | `{ email, displayName, password }` → `User` (201) — creates the **first admin** of a fresh deployment; requires header `X-Bootstrap-Secret: <BOOTSTRAP_SECRET>`; `409 conflict` once any user exists |
| `POST /auth/login`     | —    | `{ email, password }` → `{ accessToken, refreshToken, user }`                                                                                                                                        |
| `POST /auth/refresh`   | —    | `{ refreshToken }` → `{ accessToken, refreshToken }` (rotation: old one is revoked)                                                                                                                  |
| `POST /auth/logout`    | any  | `{ refreshToken }` → `204` (revokes the refresh token)                                                                                                                                               |
| `GET /me`              | any  | → `User`                                                                                                                                                                                             |
| `PATCH /me/password`   | any  | `{ currentPassword, newPassword }` → `204`                                                                                                                                                           |

`User = { id, email, displayName, role, disabled, createdAt }` — `role` ∈
`teacher | vie-scolaire | admin`. Password hashes never leave the server.

## Users (admin only)

| Method & path                    | Body → Response                                         |
| -------------------------------- | ------------------------------------------------------- |
| `GET /users`                     | → `User[]`                                              |
| `POST /users`                    | `{ email, displayName, role, password }` → `User` (201) |
| `PATCH /users/:id`               | `{ displayName?, role?, disabled? }` → `User`           |
| `POST /users/:id/reset-password` | `{ password }` → `204`                                  |

Users are never hard-deleted (audit integrity) — set `disabled: true`.

## SIS (classes, students & presence)

| Method & path               | Role                | Response                                                                  |
| --------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `GET /classes`              | any                 | → `SchoolClass[]` — `{ id, name, level, studentCount }`                   |
| `GET /classes/:id/students` | any                 | → `Student[]` — `{ id, firstName, lastName, classId, className }`         |
| `GET /classes/:id/presence` | vie-scolaire, admin | → `StudentPresence[]` — `{ studentId, studentName, present, observedAt }` |

`GET /classes` and `GET /classes/:id/students` are served by the configured `SisProvider`: `mock`
(deterministic fixtures, default), `aplim` (unimplemented placeholder), or `synced` (reads the
roster synced via the endpoints below — see docs/ARCHITECTURE.md, "SIS adapters"). `GET
/classes/:id/presence` always reads the synced presence log regardless of `SIS_PROVIDER`; students
never observed are omitted from the response.

## SIS sync (machine-to-machine)

Called by an external sync worker, not a human/browser client — every request requires header
`X-Sync-Api-Key: <SYNC_API_KEY>` instead of a bearer token (timing-safe comparison, same
mechanism as `X-Bootstrap-Secret`). Unset `SYNC_API_KEY` disables all three routes (`401` on
every call). **Call order matters**: sync classes, then students, then presence — students
reference a `classId` and presence observations reference a `studentId`.

| Method & path         | Body → Response                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| `PUT /sync/classes`   | `{ classes: SchoolClass[] }` → `{ upserted, deleted }` (200)                    |
| `PUT /sync/students`  | `{ students: Student[] }` → `{ upserted, deleted }` (200)                       |
| `POST /sync/presence` | `{ observations: [{ studentId, present, observedAt }] }` → `{ inserted }` (201) |

`PUT /sync/classes` and `PUT /sync/students` are **full-replace syncs**: every call is expected
to carry the complete current roster; any row not present in the payload is deleted (an empty
array is rejected with `400 validation_error` rather than silently wiping the roster).
`POST /sync/presence` is append-only — observations are never deleted by a later sync, only
pruned automatically after `PRESENCE_RETENTION_DAYS` (default 30, see docs/GDPR.md).

## Exclusions

| Method & path                     | Role                         | Body → Response                                              |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `POST /exclusions`                | teacher, vie-scolaire, admin | `CreateExclusionRequest` → `Exclusion` (201) + push          |
| `GET /exclusions`                 | any (teachers: own only)     | filters below → paginated `Exclusion[]`                      |
| `GET /exclusions/active`          | vie-scolaire, admin          | → `Exclusion[]` with status `pending\|acknowledged\|missing` |
| `GET /exclusions/:id`             | any (teachers: own only)     | → `Exclusion & { events: ExclusionEvent[] }`                 |
| `POST /exclusions/:id/transition` | per lifecycle rules          | `{ to, comment? }` → `Exclusion`                             |

```ts
CreateExclusionRequest = {
  studentId: string;
  classId: string;
  reason: ExclusionReason; // see shared constants
  comment?: string;        // required when reason === "other"
}
```

`GET /exclusions` filters: `status` (repeatable), `classId`, `studentId`, `teacherId`, `from`,
`to`, `page`, `pageSize`. Sorted by `createdAt` descending.

**Transitions** are validated by `canTransition(from, to, role, isCreator)` from
`@exclusions/shared`. Invalid transitions → `409 invalid_transition`. Each transition appends an
`ExclusionEvent` and stamps the matching timestamp column (`acknowledgedAt`, `arrivedAt`,
`missingAt`, `resolvedAt`, `cancelledAt`).

```ts
Exclusion = {
  id, studentId, studentName, classId, className,
  teacherId, teacherName, reason, comment,
  status: "pending" | "acknowledged" | "arrived" | "missing" | "resolved" | "cancelled",
  createdAt, acknowledgedAt?, arrivedAt?, missingAt?, resolvedAt?, cancelledAt?, updatedAt,
}
```

## Stats & reports

| Method & path                 | Role                | Response                                                        |
| ----------------------------- | ------------------- | --------------------------------------------------------------- |
| `GET /stats/summary`          | vie-scolaire, admin | `{ total, byStatus, byReason, avgArrivalSeconds, missingRate }` |
| `GET /stats/by-class`         | vie-scolaire, admin | `[{ classId, className, count }]` sorted desc                   |
| `GET /stats/by-student`       | vie-scolaire, admin | `[{ studentId, studentName, className, count }]` (top `limit`)  |
| `GET /stats/timeline`         | vie-scolaire, admin | `[{ bucket, count }]` — `?bucket=day\|week\|month`              |
| `GET /reports/exclusions.csv` | vie-scolaire, admin | CSV download (UTF-8, `;`-separated for French Excel)            |

All accept `?from=&to=` (ISO dates, inclusive), defaulting to the current school year
(1 August → 31 July, Europe/Paris).

## Push subscriptions

| Method & path                    | Role | Body → Response                                                                                  |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| `POST /push/subscriptions`       | any  | `{ platform: "web"\|"android"\|"ios", subscription?\|token?, deviceName? }` → `201` (idempotent) |
| `DELETE /push/subscriptions/:id` | any  | → `204`                                                                                          |
| `GET /push/vapid-public-key`     | any  | → `{ publicKey }` (for web push subscription)                                                    |

`web` requires the browser `PushSubscription` JSON (`endpoint`, `keys.p256dh`, `keys.auth`);
`android`/`ios` require the FCM registration `token`. Re-posting the same endpoint/token updates
the existing row. Expired subscriptions (`404`/`410` from the push service) are pruned on send.

## Misc

| Method & path | Auth | Response                                          |
| ------------- | ---- | ------------------------------------------------- |
| `GET /health` | none | `{ status: "ok", school: { id, name }, version }` |

## Cron trigger (not an HTTP route)

Every 5 minutes the Worker's scheduled handler moves `pending`/`acknowledged` exclusions older
than `ESCALATION_MINUTES` to `missing` (recording a `system` event) and sends the escalation push
to all vie-scolaire devices.
