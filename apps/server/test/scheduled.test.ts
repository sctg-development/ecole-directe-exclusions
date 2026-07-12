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
 * Cron sweep tests (`runScheduled`) with an injected clock: escalation of stale
 * pending/acknowledged exclusions to `missing`, and opportunistic `login_attempts` pruning.
 * `ESCALATION_MINUTES=10` in test/wrangler.test.jsonc.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Exclusion, ExclusionWithEvents } from "@exclusions/shared";
import { recordLoginAttempt } from "../src/db/loginAttempts.js";
import { runScheduled } from "../src/scheduled.js";
import { MockSisProvider } from "../src/sis/mock.js";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let teacherToken: string;
let vieScolaireToken: string;
let studentId: string;
let classId: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "sched-admin@example.org" });
  const teacher = await createAndLoginUser(admin.accessToken, {
    email: "sched-teacher@example.org",
    displayName: "Sched Teacher",
    role: "teacher",
  });
  teacherToken = teacher.accessToken;
  const vieScolaire = await createAndLoginUser(admin.accessToken, {
    email: "sched-vs@example.org",
    displayName: "Sched VS",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;

  const provider = new MockSisProvider("apprentis-auteuil");
  const classes = await provider.listClasses();
  const firstClass = classes[0];
  if (firstClass === undefined) throw new Error("expected at least one class");
  classId = firstClass.id;
  const students = await provider.listStudents(classId);
  const firstStudent = students[0];
  if (firstStudent === undefined) throw new Error("expected at least one student");
  studentId = firstStudent.id;
});

async function createExclusion(token: string, reason = "disruption"): Promise<Exclusion> {
  const response = await api.post("/api/v1/exclusions", { studentId, classId, reason }, token);
  expect(response.status).toBe(201);
  return (await response.json()) as Exclusion;
}

describe("runScheduled: escalation", () => {
  it("does not escalate a fresh pending exclusion (below ESCALATION_MINUTES)", async () => {
    const exclusion = await createExclusion(teacherToken);
    const createdAt = new Date(exclusion.createdAt);
    const tooSoon = new Date(createdAt.getTime() + 5 * 60_000); // only 5 of the 10 minutes elapsed

    await runScheduled(env, tooSoon);

    const detail = await api.get(`/api/v1/exclusions/${exclusion.id}`, vieScolaireToken);
    const body = (await detail.json()) as Exclusion;
    expect(body.status).toBe("pending");
    expect(body.missingAt).toBeNull();
  });

  it("escalates a pending exclusion older than ESCALATION_MINUTES to 'missing'", async () => {
    const exclusion = await createExclusion(teacherToken);
    const createdAt = new Date(exclusion.createdAt);
    const due = new Date(createdAt.getTime() + 11 * 60_000);

    const result = await runScheduled(env, due);
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const detail = await api.get(`/api/v1/exclusions/${exclusion.id}`, vieScolaireToken);
    const body = (await detail.json()) as ExclusionWithEvents;
    expect(body.status).toBe("missing");
    expect(body.missingAt).not.toBeNull();

    const missingEvent = body.events.find((event) => event.type === "missing");
    expect(missingEvent).toBeDefined();
    expect(missingEvent?.actorId).toBeNull();
    expect(missingEvent?.actorName).toBe("system");
  });

  it("escalates an acknowledged (not just pending) exclusion too", async () => {
    const exclusion = await createExclusion(teacherToken);
    const acknowledgeResponse = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "acknowledged" },
      vieScolaireToken,
    );
    expect(acknowledgeResponse.status).toBe(200);
    const createdAt = new Date(exclusion.createdAt);
    const due = new Date(createdAt.getTime() + 15 * 60_000);

    await runScheduled(env, due);

    const detail = await api.get(`/api/v1/exclusions/${exclusion.id}`, vieScolaireToken);
    const body = (await detail.json()) as Exclusion;
    expect(body.status).toBe("missing");
  });

  it("never escalates an already-resolved exclusion", async () => {
    const exclusion = await createExclusion(teacherToken);
    await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "acknowledged" },
      vieScolaireToken,
    );
    await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "arrived" },
      vieScolaireToken,
    );
    await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "resolved" },
      vieScolaireToken,
    );

    const createdAt = new Date(exclusion.createdAt);
    const farFuture = new Date(createdAt.getTime() + 24 * 60 * 60_000);
    await runScheduled(env, farFuture);

    const detail = await api.get(`/api/v1/exclusions/${exclusion.id}`, vieScolaireToken);
    const body = (await detail.json()) as Exclusion;
    expect(body.status).toBe("resolved");
  });
});

describe("runScheduled: login_attempts pruning", () => {
  it("prunes login_attempts older than 24 hours", async () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const old = new Date(now.getTime() - 25 * 3_600_000).toISOString();
    const recent = new Date(now.getTime() - 1 * 3_600_000).toISOString();
    await recordLoginAttempt(env.DB, "prune-test@example.org", old, false);
    await recordLoginAttempt(env.DB, "prune-test@example.org", recent, false);

    const result = await runScheduled(env, now);
    expect(result.prunedLoginAttempts).toBeGreaterThanOrEqual(1);

    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ?",
    )
      .bind("prune-test@example.org")
      .first<{ n: number }>();
    expect(remaining?.n).toBe(1);
  });
});
