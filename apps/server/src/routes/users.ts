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

/** User management routes (admin only). Users are never hard-deleted, only disabled. */

import { Hono } from "hono";
import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
} from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { hashPassword } from "../lib/crypto.js";
import { errorResponse } from "../lib/errors.js";
import { parseJsonBody } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getUserByEmail,
  getUserById,
  insertUser,
  listUsers,
  setUserPassword,
  toPublicUser,
  updateUser,
} from "../db/users.js";
import { revokeAllRefreshTokensForUser } from "../db/refreshTokens.js";

export const userRoutes = new Hono<AppEnv>();

userRoutes.use("/users/*", requireAuth, requireRole("admin"));
userRoutes.use("/users", requireAuth, requireRole("admin"));

// GET /users
userRoutes.get("/users", async (c) => {
  const users = await listUsers(c.env.DB);
  return c.json(users.map(toPublicUser));
});

// POST /users
userRoutes.post("/users", async (c) => {
  const parsed = await parseJsonBody(c.req, createUserRequestSchema);
  if (!parsed.ok) return parsed.response;

  if ((await getUserByEmail(c.env.DB, parsed.data.email)) !== null) {
    return errorResponse(409, "conflict", "A user with this email already exists");
  }
  const now = new Date().toISOString();
  const { hash, salt } = await hashPassword(parsed.data.password);
  const user = {
    id: crypto.randomUUID(),
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    role: parsed.data.role,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
  };
  await insertUser(c.env.DB, user);
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

// PATCH /users/:id
userRoutes.patch("/users/:id", async (c) => {
  const parsed = await parseJsonBody(c.req, updateUserRequestSchema);
  if (!parsed.ok) return parsed.response;
  const id = c.req.param("id");
  if ((await getUserById(c.env.DB, id)) === null) {
    return errorResponse(404, "not_found", "User not found");
  }
  const updated = await updateUser(c.env.DB, id, parsed.data, new Date().toISOString());
  if (updated === null) return errorResponse(404, "not_found", "User not found");
  return c.json(toPublicUser(updated));
});

// POST /users/:id/reset-password
userRoutes.post("/users/:id/reset-password", async (c) => {
  const parsed = await parseJsonBody(c.req, resetPasswordRequestSchema);
  if (!parsed.ok) return parsed.response;
  const id = c.req.param("id");
  if ((await getUserById(c.env.DB, id)) === null) {
    return errorResponse(404, "not_found", "User not found");
  }
  const now = new Date().toISOString();
  const { hash, salt } = await hashPassword(parsed.data.password);
  await setUserPassword(c.env.DB, id, hash, salt, now);
  await revokeAllRefreshTokensForUser(c.env.DB, id, now);
  return c.body(null, 204);
});
