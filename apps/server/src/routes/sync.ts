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
 * Machine-to-machine SIS sync routes, called by the external sync worker (not a human/browser
 * client) — gated by `requireSyncApiKey` (`X-Sync-Api-Key`), not the bearer-JWT `requireAuth`.
 * Call order matters: /sync/classes, then /sync/students, then /sync/presence (see docs/API.md).
 */

import { Hono } from "hono";
import {
  syncClassesRequestSchema,
  syncPresenceRequestSchema,
  syncStudentsRequestSchema,
} from "@exclusions/shared";
import type { SyncPresenceResult, SyncResult } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { parseJsonBody } from "../lib/validate.js";
import { requireSyncApiKey } from "../middleware/auth.js";
import { upsertClasses } from "../db/classes.js";
import { upsertStudents } from "../db/students.js";
import { insertPresenceObservations } from "../db/presence.js";

export const syncRoutes = new Hono<AppEnv>();

syncRoutes.use("/sync/*", requireSyncApiKey);

// PUT /sync/classes — full-replace sync of the class roster.
syncRoutes.put("/sync/classes", async (c) => {
  const parsed = await parseJsonBody(c.req, syncClassesRequestSchema);
  if (!parsed.ok) return parsed.response;
  const result = await upsertClasses(c.env.DB, parsed.data.classes, new Date().toISOString());
  return c.json(result satisfies SyncResult);
});

// PUT /sync/students — full-replace sync of the student roster.
syncRoutes.put("/sync/students", async (c) => {
  const parsed = await parseJsonBody(c.req, syncStudentsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const result = await upsertStudents(c.env.DB, parsed.data.students, new Date().toISOString());
  return c.json(result satisfies SyncResult);
});

// POST /sync/presence — append-only presence observations.
syncRoutes.post("/sync/presence", async (c) => {
  const parsed = await parseJsonBody(c.req, syncPresenceRequestSchema);
  if (!parsed.ok) return parsed.response;
  const inserted = await insertPresenceObservations(
    c.env.DB,
    parsed.data.observations,
    new Date().toISOString(),
  );
  return c.json({ inserted } satisfies SyncPresenceResult, 201);
});
