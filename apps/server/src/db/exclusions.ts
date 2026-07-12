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

/** Repository for the `exclusions` table (snake_case rows ↔ the shared `Exclusion` type). */

import { ACTIVE_STATUSES } from "@exclusions/shared";
import type { Exclusion, ExclusionReason, ExclusionStatus } from "@exclusions/shared";

interface ExclusionRow {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  arrived_at: string | null;
  missing_at: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

function mapExclusion(row: ExclusionRow): Exclusion {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    classId: row.class_id,
    className: row.class_name,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    reason: row.reason as ExclusionReason,
    comment: row.comment,
    status: row.status as ExclusionStatus,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    arrivedAt: row.arrived_at,
    missingAt: row.missing_at,
    resolvedAt: row.resolved_at,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
  };
}

/** Prepared INSERT — returned unexecuted so callers can batch it with the audit event. */
export function insertExclusionStmt(db: D1Database, exclusion: Exclusion): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO exclusions (id, student_id, student_name, class_id, class_name, teacher_id,
         teacher_name, reason, comment, status, created_at, acknowledged_at, arrived_at,
         missing_at, resolved_at, cancelled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      exclusion.id,
      exclusion.studentId,
      exclusion.studentName,
      exclusion.classId,
      exclusion.className,
      exclusion.teacherId,
      exclusion.teacherName,
      exclusion.reason,
      exclusion.comment,
      exclusion.status,
      exclusion.createdAt,
      exclusion.acknowledgedAt,
      exclusion.arrivedAt,
      exclusion.missingAt,
      exclusion.resolvedAt,
      exclusion.cancelledAt,
      exclusion.updatedAt,
    );
}

/**
 * Prepared UPDATE of every mutable column, guarded by the status the caller read
 * (`expectedStatus`). `run()` on the result reports `meta.changes === 0` when the row's status
 * no longer matches — i.e. another request (or the cron escalation sweep) transitioned it
 * concurrently — so the caller can detect the lost race instead of silently overwriting it.
 */
export function updateExclusionStmt(
  db: D1Database,
  exclusion: Exclusion,
  expectedStatus: ExclusionStatus,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE exclusions SET status = ?, acknowledged_at = ?, arrived_at = ?, missing_at = ?,
         resolved_at = ?, cancelled_at = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    )
    .bind(
      exclusion.status,
      exclusion.acknowledgedAt,
      exclusion.arrivedAt,
      exclusion.missingAt,
      exclusion.resolvedAt,
      exclusion.cancelledAt,
      exclusion.updatedAt,
      exclusion.id,
      expectedStatus,
    );
}

/** Pure transition: sets the new status and stamps the matching `*At` column. */
export function applyTransitionToExclusion(
  exclusion: Exclusion,
  to: ExclusionStatus,
  nowIso: string,
): Exclusion {
  const updated: Exclusion = { ...exclusion, status: to, updatedAt: nowIso };
  switch (to) {
    case "acknowledged":
      updated.acknowledgedAt = nowIso;
      break;
    case "arrived":
      updated.arrivedAt = nowIso;
      break;
    case "missing":
      updated.missingAt = nowIso;
      break;
    case "resolved":
      updated.resolvedAt = nowIso;
      break;
    case "cancelled":
      updated.cancelledAt = nowIso;
      break;
    case "pending":
      // Unreachable: `canTransition` never allows a transition back to `pending`.
      break;
  }
  return updated;
}

export async function getExclusion(db: D1Database, id: string): Promise<Exclusion | null> {
  const row = await db
    .prepare("SELECT * FROM exclusions WHERE id = ?")
    .bind(id)
    .first<ExclusionRow>();
  return row ? mapExclusion(row) : null;
}

export interface ExclusionFilters {
  status?: ExclusionStatus[] | undefined;
  classId?: string | undefined;
  studentId?: string | undefined;
  teacherId?: string | undefined;
  /** Inclusive ISO bounds on `created_at`. */
  from?: string | undefined;
  to?: string | undefined;
}

function buildWhere(filters: ExclusionFilters): { sql: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filters.status !== undefined && filters.status.length > 0) {
    clauses.push(`status IN (${filters.status.map(() => "?").join(", ")})`);
    binds.push(...filters.status);
  }
  if (filters.classId !== undefined) {
    clauses.push("class_id = ?");
    binds.push(filters.classId);
  }
  if (filters.studentId !== undefined) {
    clauses.push("student_id = ?");
    binds.push(filters.studentId);
  }
  if (filters.teacherId !== undefined) {
    clauses.push("teacher_id = ?");
    binds.push(filters.teacherId);
  }
  if (filters.from !== undefined) {
    clauses.push("created_at >= ?");
    binds.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push("created_at <= ?");
    binds.push(filters.to);
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", binds };
}

export async function listExclusions(
  db: D1Database,
  filters: ExclusionFilters,
  page: number,
  pageSize: number,
): Promise<{ items: Exclusion[]; total: number }> {
  const { sql, binds } = buildWhere(filters);
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM exclusions ${sql}`)
    .bind(...binds)
    .first<{ n: number }>();
  const rows = await db
    .prepare(`SELECT * FROM exclusions ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<ExclusionRow>();
  return { items: rows.results.map(mapExclusion), total: totalRow?.n ?? 0 };
}

/** Hard safety cap on the live dashboard query — never an unbounded table scan. */
const MAX_ACTIVE_EXCLUSIONS = 500;

/** Exclusions currently shown on the vie scolaire live dashboard. */
export async function listActiveExclusions(db: D1Database): Promise<Exclusion[]> {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT * FROM exclusions WHERE status IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(...ACTIVE_STATUSES, MAX_ACTIVE_EXCLUSIONS)
    .all<ExclusionRow>();
  return rows.results.map(mapExclusion);
}

/** Pending/acknowledged exclusions created at or before `cutoffIso` (escalation candidates). */
export async function listEscalatableExclusions(
  db: D1Database,
  cutoffIso: string,
): Promise<Exclusion[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM exclusions
       WHERE status IN ('pending', 'acknowledged') AND created_at <= ?
       ORDER BY created_at ASC`,
    )
    .bind(cutoffIso)
    .all<ExclusionRow>();
  return rows.results.map(mapExclusion);
}
