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
 * Repository for the `students` table — the SIS-synced student roster (see migration
 * 0002_sis_sync.sql). `upsertStudents` is a full-replace sync, global across all classes in one
 * call (rows absent from the payload are deleted); `class_name` is denormalized to match the
 * shared `Student` type exactly, same convention as `exclusions.student_name`/`class_name`.
 */

import type { Student } from "@exclusions/shared";
import { chunk } from "../lib/batch.js";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name: string;
  synced_at: string;
}

function mapStudent(row: StudentRow): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    classId: row.class_id,
    className: row.class_name,
  };
}

const BATCH_CHUNK_SIZE = 100;

/**
 * Same full-replace shape as `upsertClasses` in `./classes.ts` — see its doc comment for why the
 * delete diff is computed in JS and chunked rather than a single `NOT IN (...)` over the payload.
 */
export async function upsertStudents(
  db: D1Database,
  students: Student[],
  nowIso: string,
): Promise<{ upserted: number; deleted: number }> {
  const payloadIds = new Set(students.map((student) => student.id));
  const existingRows = await db.prepare("SELECT id FROM students").all<{ id: string }>();
  const idsToDelete = existingRows.results.map((row) => row.id).filter((id) => !payloadIds.has(id));

  let deleted = 0;
  for (const idsChunk of chunk(idsToDelete, BATCH_CHUNK_SIZE)) {
    const placeholders = idsChunk.map(() => "?").join(", ");
    const result = await db
      .prepare(`DELETE FROM students WHERE id IN (${placeholders})`)
      .bind(...idsChunk)
      .run();
    deleted += result.meta.changes ?? 0;
  }

  const upsertStmts = students.map((student) =>
    db
      .prepare(
        `INSERT INTO students (id, first_name, last_name, class_id, class_name, synced_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           first_name = excluded.first_name, last_name = excluded.last_name,
           class_id = excluded.class_id, class_name = excluded.class_name,
           synced_at = excluded.synced_at`,
      )
      .bind(
        student.id,
        student.firstName,
        student.lastName,
        student.classId,
        student.className,
        nowIso,
      ),
  );
  for (const batch of chunk(upsertStmts, BATCH_CHUNK_SIZE)) {
    await db.batch(batch);
  }

  return { upserted: students.length, deleted };
}

export async function listStudentsByClass(db: D1Database, classId: string): Promise<Student[]> {
  const rows = await db
    .prepare("SELECT * FROM students WHERE class_id = ? ORDER BY last_name, first_name")
    .bind(classId)
    .all<StudentRow>();
  return rows.results.map(mapStudent);
}

export async function getStudent(db: D1Database, id: string): Promise<Student | null> {
  const row = await db.prepare("SELECT * FROM students WHERE id = ?").bind(id).first<StudentRow>();
  return row ? mapStudent(row) : null;
}
