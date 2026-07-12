---
name: add-api-endpoint
description: Step-by-step recipe to add a REST API endpoint end-to-end (shared Zod schema, docs, server route with RBAC, client endpoint + hook, UI strings, tests). Use it whenever a task adds or changes an API route, request/response shape, or query parameters, so all four layers (shared, docs, server, client) stay in sync.
---

# Add an API endpoint

An endpoint touches **four places** that must ship together: `packages/shared/src/api.ts`,
`docs/API.md`, the server route, the client endpoint. Never skip one.

## 1. Schema + types in `packages/shared/src/api.ts`

- Add the request-body Zod schema (suffix `RequestSchema`) and/or query schema (suffix
  `QuerySchema`). Reuse existing atoms: `roleSchema`, `exclusionStatusSchema`,
  `isoDateOrDateTime`, `passwordSchema`.
- Export the inferred request type (`export type FooRequest = z.infer<typeof fooRequestSchema>;`)
  and a response interface in the "Response shapes" section. `src/index.ts` re-exports `api.ts`
  with `export *`, so no index edit is needed.
- Add/extend a test in `packages/shared` for non-trivial refinements (e.g. conditional
  required fields, coercions, defaults).

Conventions you must follow:

- **Error body contract** (every non-2xx response):
  `{ "error": { "code": string, "message": string } }` — `code` is one of the `ApiErrorBody`
  union: `invalid_credentials | unauthorized | forbidden | not_found | validation_error |
invalid_transition | rate_limited | conflict | internal`. Extend the union in `api.ts` if a
  genuinely new code is needed (rare).
- **Pagination convention** for list endpoints: query `?page=1&pageSize=25` (`page` ≥ 1
  default 1, `pageSize` 1–100 default 25, both `z.coerce.number().int()`), response
  `Paginated<T> = { items, page, pageSize, total }`. Sort explicitly (usually `createdAt` desc).
- Dates are ISO 8601 UTC strings; IDs are opaque UUID v4 strings.

## 2. Document in `docs/API.md`

Add a row to the matching section table: method + path (prefixed `/api/v1`), required role,
body → response. Document filters, defaults and status codes. `api.ts` is the machine-readable
source of truth; `API.md` is the human companion — they must agree.

## 3. Server route in `apps/server/src/routes/`

- Add the handler to the appropriate route file (or a new one, mounted in the app entrypoint).
- Validate input with the **shared schema** (never an inline schema). Validation failure →
  `400 validation_error` in the standard error body.
- Apply the auth middleware and an explicit role check (RBAC): follow the role column you wrote
  in `API.md`. Teachers see only their own exclusions — enforce `teacherId` scoping in the
  query, not in the client.
- Data access goes through the repository layer (D1, `snake_case` → `camelCase` mapping) —
  no inline SQL in handlers.
- If the endpoint changes exclusion status: use `canTransition()` from `@exclusions/shared`,
  append an `exclusion_events` row, stamp the `*_at` column, bump `updated_at`
  (`409 invalid_transition` on refusal).

## 4. Server integration test

In the server test suite (vitest, runs inside workerd via `@cloudflare/vitest-pool-workers`).
Cover: happy path, validation error (400), missing/invalid auth (401), wrong role (403), and
domain errors (404/409). Follow the existing test setup for migrations + seeded users.

## 5. Client endpoint + hook

- Add a typed function in `apps/client/src/api/endpoints.ts` using the shared request/response
  types (`import type { ... } from "@exclusions/shared"`).
- Add the TanStack Query hook in `apps/client/src/api/queries.ts` next to its peers (query for
  GET, mutation for writes; invalidate the affected query keys on success).

## 6. UI + French strings

Any user-facing text (labels, buttons, error toasts) goes in `apps/client/src/i18n/fr.ts` —
never hardcoded French in components. Reuse shared labels (`EXCLUSION_REASONS`,
`EXCLUSION_STATUS_LABELS_FR`, `ROLE_LABELS_FR`) where they exist.

## 7. Client test

Component/hook test with vitest + Testing Library (happy-dom). Assert rendered French strings
via the i18n module, not string literals.

## 8. Full check

Run from the repo root and make all of it pass:

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
```
