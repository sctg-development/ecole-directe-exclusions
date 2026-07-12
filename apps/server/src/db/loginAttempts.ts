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

/** Repository for the `login_attempts` table (D1-backed login rate limiting). */

export async function countLoginAttemptsSince(
  db: D1Database,
  email: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND attempted_at >= ?")
    .bind(email, sinceIso)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Records an attempt and returns its row id so the caller can upgrade it via `markLoginAttemptSuccess`. */
export async function recordLoginAttempt(
  db: D1Database,
  email: string,
  attemptedAtIso: string,
  success: boolean,
): Promise<number> {
  const result = await db
    .prepare("INSERT INTO login_attempts (email, attempted_at, success) VALUES (?, ?, ?)")
    .bind(email, attemptedAtIso, success ? 1 : 0)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function markLoginAttemptSuccess(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE login_attempts SET success = 1 WHERE id = ?").bind(id).run();
}

/** Deletes attempts older than `beforeIso`; returns the number of pruned rows. */
export async function pruneLoginAttemptsBefore(db: D1Database, beforeIso: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM login_attempts WHERE attempted_at < ?")
    .bind(beforeIso)
    .run();
  return result.meta.changes ?? 0;
}
