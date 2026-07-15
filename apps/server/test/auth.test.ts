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
 * Integration tests: bootstrap, login (incl. rate limiting), refresh rotation, logout, /me.
 *
 * `POST /auth/bootstrap` only ever succeeds once per (isolated, per-file) D1 — so this file
 * bootstraps a single admin in `beforeAll` and creates every other fixture user through the
 * admin-only `POST /users` endpoint, exactly like a real deployment would after day one.
 */

import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { LOGIN_MAX_ATTEMPTS } from "@exclusions/shared";
import {
  api,
  BOOTSTRAP_SECRET,
  bootstrapAdmin,
  createUser,
  login,
  TEST_PASSWORD,
} from "./helpers.js";

const ADMIN_EMAIL = "admin@example.org";
let adminToken: string;

beforeAll(async () => {
  await bootstrapAdmin({ email: ADMIN_EMAIL });
  const tokens = await login(ADMIN_EMAIL);
  adminToken = tokens.accessToken;
});

/** Bootstrap with the correct secret header, bypassing the helper's throw-on-failure behavior. */
async function fetchBootstrap(body: unknown): Promise<Response> {
  return exports.default.fetch("https://example.com/api/v1/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bootstrap-Secret": BOOTSTRAP_SECRET },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/bootstrap", () => {
  it("rejects a missing/incorrect bootstrap secret (401), regardless of existing users", async () => {
    const response = await api.post("/api/v1/auth/bootstrap", {
      email: "nope@example.org",
      displayName: "Nope",
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("409s once a user already exists, even with the correct secret", async () => {
    const response = await fetchBootstrap({
      email: "second-admin@example.org",
      displayName: "Second",
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("conflict");
  });
});

describe("POST /api/v1/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await createUser(adminToken, {
      email: "login-ok@example.org",
      displayName: "Login OK",
      role: "teacher",
    });
    const tokens = await login("login-ok@example.org");
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.user.email).toBe("login-ok@example.org");
  });

  it("rejects a wrong password (401 invalid_credentials)", async () => {
    await createUser(adminToken, {
      email: "login-bad@example.org",
      displayName: "Login Bad",
      role: "teacher",
    });
    const response = await api.post("/api/v1/auth/login", {
      email: "login-bad@example.org",
      password: "totally-wrong-password",
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("rejects an unknown email (401 invalid_credentials)", async () => {
    const response = await api.post("/api/v1/auth/login", {
      email: "ghost@example.org",
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(401);
  });

  it(`rate-limits after ${LOGIN_MAX_ATTEMPTS} failed attempts per e-mail (429)`, async () => {
    await createUser(adminToken, {
      email: "rate-limited@example.org",
      displayName: "Rate Limited",
      role: "teacher",
    });
    let lastStatus = 0;
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const response = await api.post("/api/v1/auth/login", {
        email: "rate-limited@example.org",
        password: "wrong-password",
      });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(401); // the first LOGIN_MAX_ATTEMPTS attempts are merely rejected

    const oneMore = await api.post("/api/v1/auth/login", {
      email: "rate-limited@example.org",
      password: "wrong-password",
    });
    expect(oneMore.status).toBe(429);
    const body = (await oneMore.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");

    // Even the CORRECT password is now rate-limited — the limiter guards the account, not the password.
    const correctButLimited = await api.post("/api/v1/auth/login", {
      email: "rate-limited@example.org",
      password: TEST_PASSWORD,
    });
    expect(correctButLimited.status).toBe(429);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the refresh token and revokes the old one", async () => {
    await createUser(adminToken, {
      email: "refresh-user@example.org",
      displayName: "Refresh User",
      role: "teacher",
    });
    const first = await login("refresh-user@example.org");

    const refreshed = await api.post("/api/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(refreshed.status).toBe(200);
    const body = (await refreshed.json()) as { accessToken: string; refreshToken: string };
    expect(body.refreshToken).not.toBe(first.refreshToken);

    // The old refresh token no longer works (rotated/revoked).
    const reuseOld = await api.post("/api/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(reuseOld.status).toBe(401);

    // The new one does.
    const reuseNew = await api.post("/api/v1/auth/refresh", { refreshToken: body.refreshToken });
    expect(reuseNew.status).toBe(200);
  });

  it("rejects a garbage refresh token (401)", async () => {
    const response = await api.post("/api/v1/auth/refresh", { refreshToken: "not-a-real-token" });
    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh token so it can no longer be used", async () => {
    await createUser(adminToken, {
      email: "logout-user@example.org",
      displayName: "Logout User",
      role: "teacher",
    });
    const tokens = await login("logout-user@example.org");

    const logoutResponse = await api.post(
      "/api/v1/auth/logout",
      { refreshToken: tokens.refreshToken },
      tokens.accessToken,
    );
    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await api.post("/api/v1/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    expect(refreshAfterLogout.status).toBe(401);
  });
});

describe("GET /api/v1/me and PATCH /api/v1/me/password", () => {
  it("GET /me returns the authenticated user; requires a bearer token", async () => {
    const user = await createUser(adminToken, {
      email: "me-user@example.org",
      displayName: "Me User",
      role: "teacher",
    });
    const tokens = await login("me-user@example.org");

    const authed = await api.get("/api/v1/me", tokens.accessToken);
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as { id: string };
    expect(body.id).toBe(user.id);

    const unauthed = await api.get("/api/v1/me");
    expect(unauthed.status).toBe(401);
  });

  it("changes the password and revokes existing sessions", async () => {
    await createUser(adminToken, {
      email: "pw-change@example.org",
      displayName: "Pw Change",
      role: "teacher",
    });
    const tokens = await login("pw-change@example.org");

    const wrongCurrent = await api.patch(
      "/api/v1/me/password",
      { currentPassword: "wrong-current", newPassword: "brand-new-password-1" },
      tokens.accessToken,
    );
    expect(wrongCurrent.status).toBe(401);

    const changed = await api.patch(
      "/api/v1/me/password",
      { currentPassword: TEST_PASSWORD, newPassword: "brand-new-password-1" },
      tokens.accessToken,
    );
    expect(changed.status).toBe(204);

    // Old refresh token is now revoked.
    const refreshOld = await api.post("/api/v1/auth/refresh", {
      refreshToken: tokens.refreshToken,
    });
    expect(refreshOld.status).toBe(401);

    // New password logs in fine; old one no longer works.
    const loginNew = await api.post("/api/v1/auth/login", {
      email: "pw-change@example.org",
      password: "brand-new-password-1",
    });
    expect(loginNew.status).toBe(200);
    const loginOld = await api.post("/api/v1/auth/login", {
      email: "pw-change@example.org",
      password: TEST_PASSWORD,
    });
    expect(loginOld.status).toBe(401);
  });
});
