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
 * Auth routes: bootstrap (first admin), login (rate-limited), refresh-token rotation, logout,
 * and the `/me` self-service endpoints.
 */

import { Hono } from "hono";
import {
  changePasswordRequestSchema,
  createUserRequestSchema,
  loginRequestSchema,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MINUTES,
  refreshRequestSchema,
} from "@exclusions/shared";
import type { LoginResponse, RefreshResponse } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { hashPassword, secretsEqual, verifyPassword } from "../lib/crypto.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
} from "../lib/tokens.js";
import { errorResponse } from "../lib/errors.js";
import { parseJsonBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getUserByEmail,
  getUserById,
  insertFirstAdmin,
  setUserPassword,
  toPublicUser,
} from "../db/users.js";
import type { UserRecord } from "../db/users.js";
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
} from "../db/refreshTokens.js";
import {
  countLoginAttemptsSince,
  markLoginAttemptSuccess,
  recordLoginAttempt,
} from "../db/loginAttempts.js";

/** Bootstrap creates an admin: same body as user creation, without the role. */
const bootstrapRequestSchema = createUserRequestSchema.omit({ role: true });

async function issueTokenPair(
  db: D1Database,
  user: UserRecord,
  jwtSecret: string,
  now: Date,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken(user, jwtSecret, now);
  const refreshToken = generateRefreshToken();
  await insertRefreshToken(db, {
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiresAt(now),
    createdAt: now.toISOString(),
  });
  return { accessToken, refreshToken };
}

export const authRoutes = new Hono<AppEnv>();

// POST /auth/bootstrap — creates the FIRST admin of a fresh deployment.
authRoutes.post("/auth/bootstrap", async (c) => {
  const providedSecret = c.req.header("X-Bootstrap-Secret");
  const expectedSecret = c.env.BOOTSTRAP_SECRET;
  if (
    expectedSecret === undefined ||
    expectedSecret === "" ||
    providedSecret === undefined ||
    !(await secretsEqual(providedSecret, expectedSecret))
  ) {
    return errorResponse(401, "unauthorized", "Invalid bootstrap secret");
  }
  const parsed = await parseJsonBody(c.req, bootstrapRequestSchema);
  if (!parsed.ok) return parsed.response;

  const now = new Date().toISOString();
  const { hash, salt } = await hashPassword(parsed.data.password);
  const user = {
    id: crypto.randomUUID(),
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    role: "admin" as const,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
  };
  // Atomic INSERT ... WHERE NOT EXISTS: two concurrent bootstrap calls can't both succeed.
  const created = await insertFirstAdmin(c.env.DB, user);
  if (!created) {
    return errorResponse(409, "conflict", "This deployment already has users");
  }
  return c.json(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      disabled: false,
      createdAt: now,
    },
    201,
  );
});

// POST /auth/login — email + password, rate-limited per e-mail.
authRoutes.post("/auth/login", async (c) => {
  const parsed = await parseJsonBody(c.req, loginRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;
  const now = new Date();

  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000).toISOString();
  const recentAttempts = await countLoginAttemptsSince(c.env.DB, email, windowStart);
  if (recentAttempts >= LOGIN_MAX_ATTEMPTS) {
    return errorResponse(429, "rate_limited", "Too many login attempts, retry in a few minutes");
  }

  // Recorded before the (slow, ~100ms) PBKDF2 verification below, not after: this shrinks the
  // window in which a burst of concurrent requests for the same e-mail could all pass the
  // count check above before any of their attempts are visible to it.
  const attemptId = await recordLoginAttempt(c.env.DB, email, now.toISOString(), false);

  const user = await getUserByEmail(c.env.DB, email);
  const validPassword =
    user !== null &&
    !user.disabled &&
    (await verifyPassword(password, user.passwordHash, user.passwordSalt));
  if (validPassword) await markLoginAttemptSuccess(c.env.DB, attemptId);
  if (user === null || !validPassword) {
    return errorResponse(401, "invalid_credentials", "Invalid email or password");
  }

  const tokens = await issueTokenPair(c.env.DB, user, c.env.JWT_SECRET, now);
  const body: LoginResponse = { ...tokens, user: toPublicUser(user) };
  return c.json(body);
});

// POST /auth/refresh — rotation: the presented token is revoked, a new pair is issued.
authRoutes.post("/auth/refresh", async (c) => {
  const parsed = await parseJsonBody(c.req, refreshRequestSchema);
  if (!parsed.ok) return parsed.response;
  const now = new Date();

  const tokenHash = await hashRefreshToken(parsed.data.refreshToken);
  const stored = await findRefreshTokenByHash(c.env.DB, tokenHash);
  if (stored === null || stored.revokedAt !== null || stored.expiresAt <= now.toISOString()) {
    return errorResponse(401, "unauthorized", "Invalid or expired refresh token");
  }
  // Revoke first (guarded compare-and-swap) so the token is consumed exactly once, regardless
  // of what happens next. If two requests present the same token concurrently, only one of
  // them gets `true` here; the loser is treated as reuse and every session for the user is
  // killed defensively, same as a detected stolen-token replay.
  const wonRace = await revokeRefreshToken(c.env.DB, stored.id, now.toISOString());
  if (!wonRace) {
    await revokeAllRefreshTokensForUser(c.env.DB, stored.userId, now.toISOString());
    return errorResponse(401, "unauthorized", "Invalid or expired refresh token");
  }
  const user = await getUserById(c.env.DB, stored.userId);
  if (user === null || user.disabled) {
    return errorResponse(401, "unauthorized", "Account is disabled");
  }
  const body: RefreshResponse = await issueTokenPair(c.env.DB, user, c.env.JWT_SECRET, now);
  return c.json(body);
});

// POST /auth/logout — revokes the presented refresh token (idempotent).
authRoutes.post("/auth/logout", requireAuth, async (c) => {
  const parsed = await parseJsonBody(c.req, refreshRequestSchema);
  if (!parsed.ok) return parsed.response;
  const tokenHash = await hashRefreshToken(parsed.data.refreshToken);
  await revokeRefreshTokenByHash(c.env.DB, tokenHash, new Date().toISOString());
  return c.body(null, 204);
});

// GET /me
authRoutes.get("/me", requireAuth, async (c) => {
  const user = await getUserById(c.env.DB, c.get("auth").userId);
  if (user === null) return errorResponse(404, "not_found", "User not found");
  return c.json(toPublicUser(user));
});

// PATCH /me/password
authRoutes.patch("/me/password", requireAuth, async (c) => {
  const parsed = await parseJsonBody(c.req, changePasswordRequestSchema);
  if (!parsed.ok) return parsed.response;
  const user = await getUserById(c.env.DB, c.get("auth").userId);
  if (user === null) return errorResponse(404, "not_found", "User not found");
  const validPassword = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
    user.passwordSalt,
  );
  if (!validPassword) {
    return errorResponse(401, "invalid_credentials", "Current password is incorrect");
  }
  const now = new Date().toISOString();
  const { hash, salt } = await hashPassword(parsed.data.newPassword);
  await setUserPassword(c.env.DB, user.id, hash, salt, now);
  // Changing the password invalidates every session.
  await revokeAllRefreshTokensForUser(c.env.DB, user.id, now);
  return c.body(null, 204);
});
