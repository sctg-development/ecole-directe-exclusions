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

/** Repository for the `users` table (snake_case rows ↔ camelCase records). */

import type { Role, User } from "@exclusions/shared";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  password_hash: string;
  password_salt: string;
  disabled: number;
  created_at: string;
  updated_at: string;
}

/** Full server-side user record; `toPublicUser` strips the credentials. */
export interface UserRecord extends User {
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as Role,
    disabled: row.disabled !== 0,
    createdAt: row.created_at,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    updatedAt: row.updated_at,
  };
}

/** The API-facing `User` shape — password hash and salt never leave the server. */
export function toPublicUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    disabled: record.disabled,
    createdAt: record.createdAt,
  };
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRecord | null> {
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<UserRecord | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function listUsers(db: D1Database): Promise<UserRecord[]> {
  const result = await db.prepare("SELECT * FROM users ORDER BY created_at ASC").all<UserRow>();
  return result.results.map(mapUser);
}

export interface NewUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

export async function insertUser(db: D1Database, user: NewUser): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, password_hash, password_salt, disabled,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      user.id,
      user.email,
      user.displayName,
      user.role,
      user.passwordHash,
      user.passwordSalt,
      user.createdAt,
      user.createdAt,
    )
    .run();
}

/**
 * Inserts the very first admin, atomically guarded by `WHERE NOT EXISTS (SELECT 1 FROM users)`
 * in a single statement — unlike a separate `countUsers()` check followed by `insertUser()`,
 * this can't race two concurrent bootstrap calls into both succeeding. Returns `true` if this
 * call created the user, `false` if a user already existed (no row was inserted).
 */
export async function insertFirstAdmin(db: D1Database, user: NewUser): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, password_hash, password_salt, disabled,
         created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, 0, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM users)`,
    )
    .bind(
      user.id,
      user.email,
      user.displayName,
      user.role,
      user.passwordHash,
      user.passwordSalt,
      user.createdAt,
      user.createdAt,
    )
    .run();
  return result.meta.changes > 0;
}

export interface UserPatch {
  displayName?: string | undefined;
  role?: Role | undefined;
  disabled?: boolean | undefined;
}

/** Applies a partial admin update; returns the updated record or null when missing. */
export async function updateUser(
  db: D1Database,
  id: string,
  patch: UserPatch,
  nowIso: string,
): Promise<UserRecord | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.displayName !== undefined) {
    sets.push("display_name = ?");
    binds.push(patch.displayName);
  }
  if (patch.role !== undefined) {
    sets.push("role = ?");
    binds.push(patch.role);
  }
  if (patch.disabled !== undefined) {
    sets.push("disabled = ?");
    binds.push(patch.disabled ? 1 : 0);
  }
  if (sets.length > 0) {
    sets.push("updated_at = ?");
    binds.push(nowIso, id);
    await db
      .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }
  return getUserById(db, id);
}

export async function setUserPassword(
  db: D1Database,
  id: string,
  passwordHash: string,
  passwordSalt: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, passwordSalt, nowIso, id)
    .run();
}
