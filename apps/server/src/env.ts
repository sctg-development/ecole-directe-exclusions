/*
MIT License
Copyright (c) 2026 Ronan Le Meillat - SCTG Development
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import type { Role } from "@exclusions/shared";

/**
 * Worker bindings, variables and secrets. Vars live in `wrangler.jsonc` (one wrangler
 * environment per school); secrets are set with `wrangler secret put <NAME> --env <school-id>`
 * and are never stored in git (see the comment atop wrangler.jsonc).
 */
export interface Env {
  /** Per-school D1 database (GDPR isolation: one database per school, never shared). */
  DB: D1Database;
  /** Static assets binding serving the built web client. Absent in tests. */
  ASSETS?: Fetcher;

  // --- Vars (wrangler.jsonc) ---
  SCHOOL_ID: string;
  SCHOOL_NAME: string;
  /** SIS adapter selection: "mock" | "aplim". */
  SIS_PROVIDER: string;
  /** Minutes before a pending/acknowledged exclusion escalates to `missing`. */
  ESCALATION_MINUTES: string;
  /** Data retention period in months (documented manual purge, see docs/GDPR.md). */
  RETENTION_MONTHS: string;
  /** VAPID `sub` claim, e.g. "mailto:ops@example.org". */
  VAPID_SUBJECT: string;

  // --- Secrets (`wrangler secret put`) ---
  /** HS256 signing key for access tokens. */
  JWT_SECRET: string;
  /** One-time secret enabling POST /api/v1/auth/bootstrap (first admin creation). */
  BOOTSTRAP_SECRET?: string;
  /** Web Push VAPID public key (base64url, uncompressed P-256 point). */
  VAPID_PUBLIC_KEY?: string;
  /** Web Push VAPID private key (base64url, 32-byte scalar). */
  VAPID_PRIVATE_KEY?: string;
  /** Optional Firebase service-account JSON; when unset the FCM sender is a logging no-op. */
  FCM_SERVICE_ACCOUNT?: string;
}

/** Per-request authentication context, set by the auth middleware from the access token. */
export interface AuthContext {
  userId: string;
  role: Role;
  name: string;
}

/** Hono generic environment: worker bindings + per-request variables. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthContext;
  };
};
