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
 * Stats correctness on seeded fixtures. Exclusions are inserted directly through the repository
 * layer (`insertExclusionStmt`) so every timestamp is fully controlled — the stats routes always
 * receive an explicit `?from=&to=` range in these tests, so they never depend on the real
 * wall-clock "current school year" default.
 *
 * Fixture dates were chosen so the ISO week buckets are easy to hand-verify:
 * 2026-01-05 is a Monday, so 05/06/10 fall in the week starting 2026-01-05, 15 in the week
 * starting 2026-01-12, and 20 in the week starting 2026-01-19.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ClassStat,
  Exclusion,
  StatsSummary,
  StudentStat,
  TimelineBucket,
} from "@exclusions/shared";
import { insertExclusionStmt } from "../src/db/exclusions.js";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let vieScolaireToken: string;
let teacherId: string;
let teacherName: string;

const RANGE = "?from=2026-01-01&to=2026-01-31";

function fixture(partial: Partial<Exclusion> & Pick<Exclusion, "id" | "createdAt">): Exclusion {
  return {
    studentId: "stu-x",
    studentName: "Student X",
    classId: "cls-x",
    className: "Class X",
    teacherId,
    teacherName,
    reason: "disruption",
    comment: null,
    status: "resolved",
    acknowledgedAt: null,
    arrivedAt: null,
    missingAt: null,
    resolvedAt: null,
    cancelledAt: null,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "stats-admin@example.org" });
  const vieScolaire = await createAndLoginUser(admin.accessToken, {
    email: "stats-vs@example.org",
    displayName: "Stats VS",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;
  const teacher = await createAndLoginUser(admin.accessToken, {
    email: "stats-teacher@example.org",
    displayName: "Stats Teacher",
    role: "teacher",
  });
  teacherId = teacher.user.id;
  teacherName = teacher.user.displayName;

  const rows: Exclusion[] = [
    // Row 1: resolved, disruption, class C1, student S1, arrived 300s after creation. Monday.
    fixture({
      id: "fx-1",
      createdAt: "2026-01-05T10:00:00.000Z",
      classId: "cls-1",
      className: "C1",
      studentId: "stu-1",
      studentName: "S1",
      reason: "disruption",
      status: "resolved",
      arrivedAt: "2026-01-05T10:05:00.000Z",
      resolvedAt: "2026-01-05T10:10:00.000Z",
    }),
    // Row 2: missing, disrespect, class C1, student S2. Tuesday, same ISO week as row 1.
    fixture({
      id: "fx-2",
      createdAt: "2026-01-06T09:00:00.000Z",
      classId: "cls-1",
      className: "C1",
      studentId: "stu-2",
      studentName: "S2",
      reason: "disrespect",
      status: "missing",
      missingAt: "2026-01-06T09:15:00.000Z",
    }),
    // Row 3: resolved, disruption, class C2, student S1 again (repeat student). Saturday, same week.
    fixture({
      id: "fx-3",
      createdAt: "2026-01-10T08:00:00.000Z",
      classId: "cls-2",
      className: "C2",
      studentId: "stu-1",
      studentName: "S1",
      reason: "disruption",
      status: "resolved",
      arrivedAt: "2026-01-10T08:10:00.000Z",
      resolvedAt: "2026-01-10T08:20:00.000Z",
    }),
    // Row 4: pending, refusal, class C2, student S3. Thursday, week of Jan 12.
    fixture({
      id: "fx-4",
      createdAt: "2026-01-15T14:00:00.000Z",
      classId: "cls-2",
      className: "C2",
      studentId: "stu-3",
      studentName: "S3",
      reason: "refusal",
      status: "pending",
    }),
    // Row 5: cancelled, equipment, class C1, student S4. Tuesday, week of Jan 19.
    fixture({
      id: "fx-5",
      createdAt: "2026-01-20T11:00:00.000Z",
      classId: "cls-1",
      className: "C1",
      studentId: "stu-4",
      studentName: "S4",
      reason: "equipment",
      status: "cancelled",
      cancelledAt: "2026-01-20T11:05:00.000Z",
    }),
    // Row 6: OUT OF RANGE (2025-12-31) — must never appear in any of the assertions below.
    fixture({
      id: "fx-6",
      createdAt: "2025-12-31T23:00:00.000Z",
      classId: "cls-1",
      className: "C1",
      studentId: "stu-5",
      studentName: "S5 (out of range)",
      reason: "disruption",
      status: "resolved",
      arrivedAt: "2025-12-31T23:30:00.000Z",
    }),
  ];
  await env.DB.batch(rows.map((row) => insertExclusionStmt(env.DB, row)));
});

describe("GET /api/v1/stats/summary", () => {
  it("computes total/byStatus/byReason/avgArrivalSeconds/missingRate over the range", async () => {
    const response = await api.get(`/api/v1/stats/summary${RANGE}`, vieScolaireToken);
    expect(response.status).toBe(200);
    const body = (await response.json()) as StatsSummary;

    expect(body.total).toBe(5);
    expect(body.byStatus).toEqual({ resolved: 2, missing: 1, pending: 1, cancelled: 1 });
    expect(body.byReason).toEqual({ disruption: 2, disrespect: 1, refusal: 1, equipment: 1 });
    // (300 + 600) / 2 = 450 seconds.
    expect(body.avgArrivalSeconds).toBe(450);
    // 1 of 5 exclusions has a missing_at.
    expect(body.missingRate).toBeCloseTo(0.2, 5);
  });
});

describe("GET /api/v1/stats/by-class", () => {
  it("groups by class, sorted by count descending", async () => {
    const response = await api.get(`/api/v1/stats/by-class${RANGE}`, vieScolaireToken);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ClassStat[];
    // C1 has rows 1, 2, 5 => 3; C2 has rows 3, 4 => 2.
    expect(body).toEqual([
      { classId: "cls-1", className: "C1", count: 3 },
      { classId: "cls-2", className: "C2", count: 2 },
    ]);
  });
});

describe("GET /api/v1/stats/by-student", () => {
  it("groups by student, sorted by count descending, respecting the limit", async () => {
    const response = await api.get(`/api/v1/stats/by-student${RANGE}&limit=2`, vieScolaireToken);
    expect(response.status).toBe(200);
    const body = (await response.json()) as StudentStat[];
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ studentId: "stu-1", studentName: "S1", count: 2 });
  });
});

describe("GET /api/v1/stats/timeline", () => {
  it("buckets by day", async () => {
    const response = await api.get(`/api/v1/stats/timeline${RANGE}&bucket=day`, vieScolaireToken);
    const body = (await response.json()) as TimelineBucket[];
    expect(body).toEqual([
      { bucket: "2026-01-05", count: 1 },
      { bucket: "2026-01-06", count: 1 },
      { bucket: "2026-01-10", count: 1 },
      { bucket: "2026-01-15", count: 1 },
      { bucket: "2026-01-20", count: 1 },
    ]);
  });

  it("buckets by month", async () => {
    const response = await api.get(`/api/v1/stats/timeline${RANGE}&bucket=month`, vieScolaireToken);
    const body = (await response.json()) as TimelineBucket[];
    expect(body).toEqual([{ bucket: "2026-01", count: 5 }]);
  });

  it("buckets by ISO week (Monday start)", async () => {
    const response = await api.get(`/api/v1/stats/timeline${RANGE}&bucket=week`, vieScolaireToken);
    const body = (await response.json()) as TimelineBucket[];
    expect(body).toEqual([
      { bucket: "2026-01-05", count: 3 },
      { bucket: "2026-01-12", count: 1 },
      { bucket: "2026-01-19", count: 1 },
    ]);
  });
});
