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
 * Repository for the `classes` table — the SIS-synced class roster (see migration
 * 0002_sis_sync.sql). `upsertClasses` is a full-replace sync: rows absent from the payload
 * are deleted.
 */

import type { SchoolClass } from "@exclusions/shared";
import { chunk } from "../lib/batch.js";

interface ClassRow {
  id: string;
  name: string;
  level: string;
  student_count: number;
  synced_at: string;
}

function mapClass(row: ClassRow): SchoolClass {
  return { id: row.id, name: row.name, level: row.level, studentCount: row.student_count };
}

/** Keeps each `db.batch()` call bounded regardless of school size (up to ~1500 students). */
const BATCH_CHUNK_SIZE = 100;

/**
 * Replaces the class roster: deletes rows not present in `classes`, then upserts every entry.
 * The "which rows to delete" diff is computed in JS (not a SQL `NOT IN (...)` over the whole
 * payload) and deleted in chunks — D1/SQLite caps the number of bound variables per statement
 * well below a realistic school's roster size, so binding one placeholder per synced row would
 * fail (`too many SQL variables`) once a sync carries more than a couple hundred rows. Each
 * chunk is its own transaction — a mid-sync failure is recovered by the next full sync.
 */
export async function upsertClasses(
  db: D1Database,
  classes: SchoolClass[],
  nowIso: string,
): Promise<{ upserted: number; deleted: number }> {
  const payloadIds = new Set(classes.map((schoolClass) => schoolClass.id));
  const existingRows = await db.prepare("SELECT id FROM classes").all<{ id: string }>();
  const idsToDelete = existingRows.results.map((row) => row.id).filter((id) => !payloadIds.has(id));

  let deleted = 0;
  for (const idsChunk of chunk(idsToDelete, BATCH_CHUNK_SIZE)) {
    const placeholders = idsChunk.map(() => "?").join(", ");
    const result = await db
      .prepare(`DELETE FROM classes WHERE id IN (${placeholders})`)
      .bind(...idsChunk)
      .run();
    deleted += result.meta.changes ?? 0;
  }

  const upsertStmts = classes.map((schoolClass) =>
    db
      .prepare(
        `INSERT INTO classes (id, name, level, student_count, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, level = excluded.level,
           student_count = excluded.student_count, synced_at = excluded.synced_at`,
      )
      .bind(schoolClass.id, schoolClass.name, schoolClass.level, schoolClass.studentCount, nowIso),
  );
  for (const batch of chunk(upsertStmts, BATCH_CHUNK_SIZE)) {
    await db.batch(batch);
  }

  return { upserted: classes.length, deleted };
}

export async function listClasses(db: D1Database): Promise<SchoolClass[]> {
  const rows = await db.prepare("SELECT * FROM classes ORDER BY name").all<ClassRow>();
  return rows.results.map(mapClass);
}

export async function getClass(db: D1Database, id: string): Promise<SchoolClass | null> {
  const row = await db.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first<ClassRow>();
  return row ? mapClass(row) : null;
}
