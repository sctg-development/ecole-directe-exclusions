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
 * Repository for the append-only `student_presence_events` log (see migration
 * 0002_sis_sync.sql). Pruned automatically by the cron handler after `PRESENCE_RETENTION_DAYS`
 * (docs/GDPR.md) — this is a materially more sensitive data category than the roster, so nothing
 * here retains history beyond that window.
 */

import type { StudentPresence } from "@exclusions/shared";
import { chunk } from "../lib/batch.js";

export interface PresenceObservationInput {
  studentId: string;
  present: boolean;
  observedAt: string;
}

interface PresenceRow {
  student_id: string;
  first_name: string;
  last_name: string;
  present: number;
  observed_at: string;
}

const BATCH_CHUNK_SIZE = 100;

/** Appends observations; correctness of `studentId` is the sync worker's responsibility (see
 * docs/API.md — call /sync/classes then /sync/students before /sync/presence). */
export async function insertPresenceObservations(
  db: D1Database,
  observations: PresenceObservationInput[],
  nowIso: string,
): Promise<number> {
  const stmts = observations.map((observation) =>
    db
      .prepare(
        `INSERT INTO student_presence_events (id, student_id, present, observed_at, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        observation.studentId,
        observation.present ? 1 : 0,
        observation.observedAt,
        nowIso,
      ),
  );
  for (const batch of chunk(stmts, BATCH_CHUNK_SIZE)) {
    await db.batch(batch);
  }
  return observations.length;
}

/** Latest known presence for every student in a class; students never observed are omitted. */
export async function latestPresenceByClass(
  db: D1Database,
  classId: string,
): Promise<StudentPresence[]> {
  const rows = await db
    .prepare(
      `SELECT s.id AS student_id, s.first_name, s.last_name, latest.present, latest.observed_at
       FROM students s
       JOIN (
         SELECT student_id, present, observed_at,
                ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY observed_at DESC) AS rn
         FROM student_presence_events
       ) latest ON latest.student_id = s.id AND latest.rn = 1
       WHERE s.class_id = ?
       ORDER BY s.last_name, s.first_name`,
    )
    .bind(classId)
    .all<PresenceRow>();
  return rows.results.map((row) => ({
    studentId: row.student_id,
    studentName: `${row.first_name} ${row.last_name}`,
    present: row.present === 1,
    observedAt: row.observed_at,
  }));
}

/** Deletes presence observations older than `beforeIso`; returns the number of pruned rows. */
export async function prunePresenceBefore(db: D1Database, beforeIso: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM student_presence_events WHERE observed_at < ?")
    .bind(beforeIso)
    .run();
  return result.meta.changes ?? 0;
}
