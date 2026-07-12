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

/** Repository for the `refresh_tokens` table (opaque tokens stored SHA-256-hashed). */

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

function mapRefreshToken(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function insertRefreshToken(
  db: D1Database,
  record: { id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(record.id, record.userId, record.tokenHash, record.expiresAt, record.createdAt)
    .run();
}

export async function findRefreshTokenByHash(
  db: D1Database,
  tokenHash: string,
): Promise<RefreshTokenRecord | null> {
  const row = await db
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<RefreshTokenRow>();
  return row ? mapRefreshToken(row) : null;
}

/**
 * Revokes the token, guarded by `revoked_at IS NULL` so this is a compare-and-swap: returns
 * `true` only if THIS call actually flipped it (the token was still live). A concurrent request
 * presenting the same token (a race, or token reuse after theft) gets `false` and must not be
 * allowed to proceed as if it had won.
 */
export async function revokeRefreshToken(
  db: D1Database,
  id: string,
  nowIso: string,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(nowIso, id)
    .run();
  return result.meta.changes > 0;
}

export async function revokeRefreshTokenByHash(
  db: D1Database,
  tokenHash: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(nowIso, tokenHash)
    .run();
}

/** Revokes every live token of a user (password change / reset). */
export async function revokeAllRefreshTokensForUser(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(nowIso, userId)
    .run();
}
