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
 * Exclusion routes: creation (with SIS denormalization + push), listing, detail with the
 * audit trail, and lifecycle transitions validated by the shared `canTransition()`.
 */

import { Hono } from "hono";
import {
  canTransition,
  createExclusionRequestSchema,
  eventTypeForTransition,
  listExclusionsQuerySchema,
  transitionRequestSchema,
} from "@exclusions/shared";
import type { Exclusion, ExclusionWithEvents, Paginated } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { errorResponse } from "../lib/errors.js";
import { parseJsonBody, parseWith } from "../lib/validate.js";
import { normalizeFromDate, normalizeToDate } from "../lib/dates.js";
import { fireAndForget } from "../lib/background.js";
import {
  notifyArrivedOrResolved,
  notifyEscalation,
  notifyNewExclusion,
} from "../lib/notifications.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createSisProvider } from "../sis/index.js";
import {
  applyTransitionToExclusion,
  getExclusion,
  insertExclusionStmt,
  listActiveExclusions,
  listExclusions,
  updateExclusionStmt,
} from "../db/exclusions.js";
import type { ExclusionFilters } from "../db/exclusions.js";
import { insertEventStmt, listEventsForExclusion } from "../db/events.js";

export const exclusionRoutes = new Hono<AppEnv>();

// POST /exclusions — any staff member can report an exclusion.
exclusionRoutes.post("/exclusions", requireAuth, async (c) => {
  const parsed = await parseJsonBody(c.req, createExclusionRequestSchema);
  if (!parsed.ok) return parsed.response;
  const auth = c.get("auth");

  const provider = createSisProvider(c.env);
  const student = await provider.getStudent(parsed.data.studentId);
  if (student === null) return errorResponse(404, "not_found", "Student not found");
  if (student.classId !== parsed.data.classId) {
    return errorResponse(400, "validation_error", "classId does not match the student's class");
  }

  const now = new Date().toISOString();
  const exclusion: Exclusion = {
    id: crypto.randomUUID(),
    studentId: student.id,
    // Denormalized on purpose: history must survive SIS changes (docs/DATA-MODEL.md).
    studentName: `${student.firstName} ${student.lastName}`,
    classId: student.classId,
    className: student.className,
    teacherId: auth.userId,
    teacherName: auth.name,
    reason: parsed.data.reason,
    comment: parsed.data.comment ?? null,
    status: "pending",
    createdAt: now,
    acknowledgedAt: null,
    arrivedAt: null,
    missingAt: null,
    resolvedAt: null,
    cancelledAt: null,
    updatedAt: now,
  };
  await c.env.DB.batch([
    insertExclusionStmt(c.env.DB, exclusion),
    insertEventStmt(c.env.DB, {
      id: crypto.randomUUID(),
      exclusionId: exclusion.id,
      actorId: auth.userId,
      actorName: auth.name,
      type: "created",
      comment: exclusion.comment,
      createdAt: now,
    }),
  ]);
  fireAndForget(c, notifyNewExclusion(c.env, exclusion));
  return c.json(exclusion, 201);
});

// GET /exclusions — filtered + paginated; teachers only ever see their own.
exclusionRoutes.get("/exclusions", requireAuth, async (c) => {
  const auth = c.get("auth");
  const statuses = c.req.queries("status");
  const raw: Record<string, unknown> = { ...c.req.query() };
  if (statuses !== undefined && statuses.length > 0) raw["status"] = statuses;
  else delete raw["status"];
  const parsed = parseWith(listExclusionsQuerySchema, raw);
  if (!parsed.ok) return parsed.response;
  const query = parsed.data;

  const filters: ExclusionFilters = {
    status: query.status,
    classId: query.classId,
    studentId: query.studentId,
    teacherId: auth.role === "teacher" ? auth.userId : query.teacherId,
    from: query.from !== undefined ? normalizeFromDate(query.from) : undefined,
    to: query.to !== undefined ? normalizeToDate(query.to) : undefined,
  };
  const { items, total } = await listExclusions(c.env.DB, filters, query.page, query.pageSize);
  const body: Paginated<Exclusion> = { items, page: query.page, pageSize: query.pageSize, total };
  return c.json(body);
});

// GET /exclusions/active — the vie scolaire live dashboard.
exclusionRoutes.get(
  "/exclusions/active",
  requireAuth,
  requireRole("vie-scolaire", "admin"),
  async (c) => {
    return c.json(await listActiveExclusions(c.env.DB));
  },
);

// GET /exclusions/:id — detail with the immutable audit trail.
exclusionRoutes.get("/exclusions/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const exclusion = await getExclusion(c.env.DB, c.req.param("id"));
  if (exclusion === null) return errorResponse(404, "not_found", "Exclusion not found");
  if (auth.role === "teacher" && exclusion.teacherId !== auth.userId) {
    return errorResponse(403, "forbidden", "Teachers can only view their own exclusions");
  }
  const events = await listEventsForExclusion(c.env.DB, exclusion.id);
  const body: ExclusionWithEvents = { ...exclusion, events };
  return c.json(body);
});

// POST /exclusions/:id/transition — lifecycle changes, validated by the shared state machine.
exclusionRoutes.post("/exclusions/:id/transition", requireAuth, async (c) => {
  const parsed = await parseJsonBody(c.req, transitionRequestSchema);
  if (!parsed.ok) return parsed.response;
  const auth = c.get("auth");
  const { to, comment } = parsed.data;

  const exclusion = await getExclusion(c.env.DB, c.req.param("id"));
  if (exclusion === null) return errorResponse(404, "not_found", "Exclusion not found");

  const isCreator = exclusion.teacherId === auth.userId;
  if (!canTransition(exclusion.status, to, auth.role, isCreator)) {
    return errorResponse(
      409,
      "invalid_transition",
      `Transition from '${exclusion.status}' to '${to}' is not allowed for this actor`,
    );
  }

  const now = new Date().toISOString();
  const updated = applyTransitionToExclusion(exclusion, to, now);
  // Guarded by the status we just read: if another request (or the cron escalation sweep)
  // transitioned this exclusion in between, `changes` is 0 and we must not write the audit
  // event for a state change that didn't happen.
  const updateResult = await updateExclusionStmt(c.env.DB, updated, exclusion.status).run();
  if (updateResult.meta.changes === 0) {
    return errorResponse(
      409,
      "conflict",
      "This exclusion was changed by someone else — reload and retry",
    );
  }
  await insertEventStmt(c.env.DB, {
    id: crypto.randomUUID(),
    exclusionId: updated.id,
    actorId: auth.userId,
    actorName: auth.name,
    type: eventTypeForTransition(to),
    comment: comment ?? null,
    createdAt: now,
  }).run();

  // acknowledged/cancelled notify nobody; missing re-alerts the vie scolaire;
  // arrived/resolved inform the creating teacher.
  if (to === "missing") {
    fireAndForget(c, notifyEscalation(c.env, updated));
  } else if (to === "arrived" || to === "resolved") {
    fireAndForget(c, notifyArrivedOrResolved(c.env, updated, to));
  }
  return c.json(updated);
});
