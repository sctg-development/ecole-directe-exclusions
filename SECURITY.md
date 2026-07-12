# Security policy

This application handles data about minors in French schools. We take reports seriously and
appreciate responsible disclosure.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead, either:

- open a **private report** via GitHub Security Advisories
  (_Security → Report a vulnerability_ on the repository), or
- e-mail **ronan.le_meillat@cdvl59.eu.org**.

Include reproduction steps, the affected component (server / client / shared / workflows) and the
impact you foresee. You should receive an acknowledgement within a few days; please allow a
reasonable window for a fix before any public disclosure. There is no bug bounty — this is a
volunteer-run open-source project — but reporters are credited in release notes if they wish.

## Scope notes for researchers

- **Data at stake**: deliberately minimal. Students are stored only as a SIS identifier plus the
  display name and class name captured at incident time — no birth dates, no addresses, no
  grades, no photos. Staff accounts are e-mail + PBKDF2-SHA256 password hashes. Push
  subscriptions are pseudonymous endpoints/tokens.
- **Per-school isolation is a security boundary**: each school runs a fully independent Worker +
  D1 stack with its own secrets. Anything allowing data to cross school boundaries is a
  high-severity finding.
- **Interesting areas**: auth (JWT access tokens, rotating hashed refresh tokens, login rate
  limiting), the exclusion lifecycle authorization rules (`canTransition` in
  `packages/shared/src/lifecycle.ts`), the bootstrap endpoint (`X-Bootstrap-Secret`), Web
  Push/FCM dispatch, and the CI/CD workflows.
- **Out of scope**: denial of service through sheer volume (free-tier limits), vulnerabilities in
  Cloudflare/Google/Apple infrastructure themselves, and social engineering of school staff.

Never test against a real school deployment — use a local `wrangler dev` stack or your own
Cloudflare account. Real deployments contain data about minors.

## Supported versions

Only the latest `main` is supported. School deployments are expected to redeploy from `main`
regularly (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)).
