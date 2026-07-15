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

/**
 * Shared HTTP test helpers: every test file gets its own isolated, freshly migrated D1
 * (confirmed empirically — @cloudflare/vitest-pool-workers isolates storage per test file),
 * so `bootstrapAdmin` can safely assume it is creating the very first user.
 */

import { SELF } from "cloudflare:test";
import type { LoginResponse, Role, User } from "@exclusions/shared";

/** Matches the `BOOTSTRAP_SECRET` var in test/wrangler.test.jsonc. */
export const BOOTSTRAP_SECRET = "test-bootstrap-secret";

/** Matches the `SYNC_API_KEY` var in test/wrangler.test.jsonc. */
export const SYNC_API_KEY = "test-sync-api-key";

/** A password satisfying `MIN_PASSWORD_LENGTH` (10) used across fixtures. */
export const TEST_PASSWORD = "correct-horse-battery-staple";

interface RequestOptions {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

async function request(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token !== undefined) headers["Authorization"] = `Bearer ${options.token}`;
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  return SELF.fetch(`https://example.com${path}`, init);
}

export const api = {
  get: (path: string, token?: string): Promise<Response> =>
    request("GET", path, token !== undefined ? { token } : {}),
  post: (path: string, body?: unknown, token?: string): Promise<Response> =>
    request("POST", path, { body, ...(token !== undefined ? { token } : {}) }),
  patch: (path: string, body?: unknown, token?: string): Promise<Response> =>
    request("PATCH", path, { body, ...(token !== undefined ? { token } : {}) }),
  delete: (path: string, token?: string): Promise<Response> =>
    request("DELETE", path, token !== undefined ? { token } : {}),
};

/** Machine-to-machine sync requests, authenticated with `X-Sync-Api-Key` instead of a bearer token. */
export const syncApi = {
  put: (path: string, body: unknown, key: string = SYNC_API_KEY): Promise<Response> =>
    request("PUT", path, { body, headers: { "X-Sync-Api-Key": key } }),
  post: (path: string, body: unknown, key: string = SYNC_API_KEY): Promise<Response> =>
    request("POST", path, { body, headers: { "X-Sync-Api-Key": key } }),
};

/** Creates the first admin of a fresh D1 (the only user `POST /auth/bootstrap` ever allows). */
export async function bootstrapAdmin(
  params: { email: string; displayName?: string; password?: string } = {
    email: "admin@example.org",
  },
): Promise<User> {
  const response = await request("POST", "/api/v1/auth/bootstrap", {
    body: {
      email: params.email,
      displayName: params.displayName ?? "Admin Test",
      password: params.password ?? TEST_PASSWORD,
    },
    headers: { "X-Bootstrap-Secret": BOOTSTRAP_SECRET },
  });
  if (response.status !== 201) {
    throw new Error(`bootstrapAdmin failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as User;
}

export async function login(
  email: string,
  password: string = TEST_PASSWORD,
): Promise<LoginResponse> {
  const response = await api.post("/api/v1/auth/login", { email, password });
  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as LoginResponse;
}

/** Bootstraps the first admin and immediately logs them in. */
export async function bootstrapAndLogin(
  params: { email?: string; password?: string } = {},
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const email = params.email ?? "admin@example.org";
  const password = params.password ?? TEST_PASSWORD;
  const user = await bootstrapAdmin({ email, password });
  const tokens = await login(email, password);
  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function createUser(
  adminToken: string,
  params: { email: string; displayName: string; role: Role; password?: string },
): Promise<User> {
  const response = await api.post(
    "/api/v1/users",
    {
      email: params.email,
      displayName: params.displayName,
      role: params.role,
      password: params.password ?? TEST_PASSWORD,
    },
    adminToken,
  );
  if (response.status !== 201) {
    throw new Error(`createUser failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as User;
}

/** Convenience: creates a user via the admin API and logs them in immediately. */
export async function createAndLoginUser(
  adminToken: string,
  params: { email: string; displayName: string; role: Role; password?: string },
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const user = await createUser(adminToken, params);
  const tokens = await login(params.email, params.password ?? TEST_PASSWORD);
  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}
