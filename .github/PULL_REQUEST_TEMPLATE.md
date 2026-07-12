# Description

<!-- What does this PR change, and why? Link related issues with "Fixes #…". -->

## Checklist

- [ ] Tests added or updated (unit + integration for every feature).
- [ ] Docs updated (`docs/` and README where relevant).
- [ ] End-user UI strings are in **French** and live in the client's i18n module (no hardcoded
      strings in components); code, comments and docs are in English.
- [ ] Any exclusion lifecycle change is reflected in `packages/shared/src/lifecycle.ts` (single
      source of truth) — not re-implemented in the server or client.
- [ ] No student data, secrets or school-specific credentials in code, fixtures or logs.
- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` pass locally.
