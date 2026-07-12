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
 * Statistics routes (vie scolaire + admin). All accept `?from=&to=` (inclusive), defaulting
 * to the current school year (1 August, Europe/Paris — computed in TS, see lib/dates.ts).
 */

import { Hono } from "hono";
import {
  statsByStudentQuerySchema,
  statsQuerySchema,
  timelineQuerySchema,
} from "@exclusions/shared";
import type { ClassStat, StatsSummary, StudentStat, TimelineBucket } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { parseWith } from "../lib/validate.js";
import { resolveDateRange } from "../lib/dates.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use("/stats/*", requireAuth, requireRole("vie-scolaire", "admin"));

// GET /stats/summary
statsRoutes.get("/stats/summary", async (c) => {
  const parsed = parseWith(statsQuerySchema, c.req.query());
  if (!parsed.ok) return parsed.response;
  const { from, to } = resolveDateRange(parsed.data, new Date());

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN missing_at IS NOT NULL THEN 1 ELSE 0 END) AS missing_count,
            ROUND(AVG(CASE WHEN arrived_at IS NOT NULL
              THEN (julianday(arrived_at) - julianday(created_at)) * 86400.0 END)) AS avg_arrival
     FROM exclusions WHERE created_at >= ? AND created_at <= ?`,
  )
    .bind(from, to)
    .first<{ total: number; missing_count: number | null; avg_arrival: number | null }>();

  const byStatusRows = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM exclusions
     WHERE created_at >= ? AND created_at <= ? GROUP BY status`,
  )
    .bind(from, to)
    .all<{ status: string; n: number }>();
  const byReasonRows = await c.env.DB.prepare(
    `SELECT reason, COUNT(*) AS n FROM exclusions
     WHERE created_at >= ? AND created_at <= ? GROUP BY reason`,
  )
    .bind(from, to)
    .all<{ reason: string; n: number }>();

  const total = totals?.total ?? 0;
  const missingCount = totals?.missing_count ?? 0;
  const body: StatsSummary = {
    total,
    byStatus: Object.fromEntries(byStatusRows.results.map((row) => [row.status, row.n])),
    byReason: Object.fromEntries(byReasonRows.results.map((row) => [row.reason, row.n])),
    avgArrivalSeconds: totals?.avg_arrival ?? null,
    missingRate: total > 0 ? missingCount / total : 0,
  };
  return c.json(body);
});

// GET /stats/by-class
statsRoutes.get("/stats/by-class", async (c) => {
  const parsed = parseWith(statsQuerySchema, c.req.query());
  if (!parsed.ok) return parsed.response;
  const { from, to } = resolveDateRange(parsed.data, new Date());
  const rows = await c.env.DB.prepare(
    `SELECT class_id, MAX(class_name) AS class_name, COUNT(*) AS n
     FROM exclusions WHERE created_at >= ? AND created_at <= ?
     GROUP BY class_id ORDER BY n DESC, class_name ASC`,
  )
    .bind(from, to)
    .all<{ class_id: string; class_name: string; n: number }>();
  const body: ClassStat[] = rows.results.map((row) => ({
    classId: row.class_id,
    className: row.class_name,
    count: row.n,
  }));
  return c.json(body);
});

// GET /stats/by-student
statsRoutes.get("/stats/by-student", async (c) => {
  const parsed = parseWith(statsByStudentQuerySchema, c.req.query());
  if (!parsed.ok) return parsed.response;
  const { from, to } = resolveDateRange(parsed.data, new Date());
  const rows = await c.env.DB.prepare(
    `SELECT student_id, MAX(student_name) AS student_name, MAX(class_name) AS class_name,
            COUNT(*) AS n
     FROM exclusions WHERE created_at >= ? AND created_at <= ?
     GROUP BY student_id ORDER BY n DESC, student_name ASC LIMIT ?`,
  )
    .bind(from, to, parsed.data.limit)
    .all<{ student_id: string; student_name: string; class_name: string; n: number }>();
  const body: StudentStat[] = rows.results.map((row) => ({
    studentId: row.student_id,
    studentName: row.student_name,
    className: row.class_name,
    count: row.n,
  }));
  return c.json(body);
});

// GET /stats/timeline — day/week/month buckets; week buckets start on the ISO Monday.
statsRoutes.get("/stats/timeline", async (c) => {
  const parsed = parseWith(timelineQuerySchema, c.req.query());
  if (!parsed.ok) return parsed.response;
  const { from, to } = resolveDateRange(parsed.data, new Date());
  const bucketExpr =
    parsed.data.bucket === "day"
      ? "strftime('%Y-%m-%d', created_at)"
      : parsed.data.bucket === "month"
        ? "strftime('%Y-%m', created_at)"
        : // 'weekday 0' jumps to the next Sunday (or stays); minus 6 days lands on the ISO Monday.
          "date(created_at, 'weekday 0', '-6 days')";
  const rows = await c.env.DB.prepare(
    `SELECT ${bucketExpr} AS bucket, COUNT(*) AS n
     FROM exclusions WHERE created_at >= ? AND created_at <= ?
     GROUP BY bucket ORDER BY bucket ASC`,
  )
    .bind(from, to)
    .all<{ bucket: string; n: number }>();
  const body: TimelineBucket[] = rows.results.map((row) => ({ bucket: row.bucket, count: row.n }));
  return c.json(body);
});
