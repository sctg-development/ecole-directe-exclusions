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
 * Cron sweep (every 5 minutes):
 * - escalate `pending`/`acknowledged` exclusions older than `ESCALATION_MINUTES` to `missing`
 *   (system audit event + escalation push to the vie scolaire);
 * - prune `login_attempts` older than 24 h (GDPR, docs/DATA-MODEL.md).
 *
 * `now` is a parameter so tests can inject a clock.
 */

import { canTransition, DEFAULT_ESCALATION_MINUTES } from "@exclusions/shared";
import type { Env } from "./env.js";
import {
  applyTransitionToExclusion,
  listEscalatableExclusions,
  updateExclusionStmt,
} from "./db/exclusions.js";
import { insertEventStmt } from "./db/events.js";
import { pruneLoginAttemptsBefore } from "./db/loginAttempts.js";
import { notifyEscalation } from "./lib/notifications.js";

const LOGIN_ATTEMPTS_RETENTION_HOURS = 24;

export interface ScheduledRunResult {
  escalated: number;
  prunedLoginAttempts: number;
}

export async function runScheduled(env: Env, now: Date): Promise<ScheduledRunResult> {
  const escalationMinutes =
    Number.parseInt(env.ESCALATION_MINUTES, 10) > 0
      ? Number.parseInt(env.ESCALATION_MINUTES, 10)
      : DEFAULT_ESCALATION_MINUTES;
  const cutoffIso = new Date(now.getTime() - escalationMinutes * 60_000).toISOString();
  const nowIso = now.toISOString();

  let escalated = 0;
  const stale = await listEscalatableExclusions(env.DB, cutoffIso);
  for (const exclusion of stale) {
    // The shared state machine is the source of truth, even for the cron pseudo-role.
    if (!canTransition(exclusion.status, "missing", "system")) continue;
    const updated = applyTransitionToExclusion(exclusion, "missing", nowIso);
    // Guarded by the status this sweep read: if a manual transition (e.g. vie scolaire marking
    // the student "arrived") landed concurrently, `changes` is 0 — skip it rather than
    // overwriting the real outcome with a false "missing" escalation.
    const updateResult = await updateExclusionStmt(env.DB, updated, exclusion.status).run();
    if (updateResult.meta.changes === 0) continue;
    await insertEventStmt(env.DB, {
      id: crypto.randomUUID(),
      exclusionId: updated.id,
      actorId: null,
      actorName: "system",
      type: "missing",
      comment: null,
      createdAt: nowIso,
    }).run();
    escalated += 1;
    await notifyEscalation(env, updated);
  }

  const pruneBefore = new Date(
    now.getTime() - LOGIN_ATTEMPTS_RETENTION_HOURS * 3_600_000,
  ).toISOString();
  const prunedLoginAttempts = await pruneLoginAttemptsBefore(env.DB, pruneBefore);

  if (escalated > 0 || prunedLoginAttempts > 0) {
    console.log(
      `cron sweep: escalated ${escalated} exclusion(s), pruned ${prunedLoginAttempts} login attempt(s)`,
    );
  }
  return { escalated, prunedLoginAttempts };
}
