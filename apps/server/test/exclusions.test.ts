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
 * Exclusion lifecycle integration tests: creation, the full happy path with its audit trail,
 * invalid transitions, and teacher-cancel-own-vs-other's-exclusion semantics.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { Exclusion, ExclusionWithEvents } from "@exclusions/shared";
import { MockSisProvider } from "../src/sis/mock.js";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let adminToken: string;
let teacherAToken: string;
let teacherBToken: string;
let vieScolaireToken: string;
let studentId: string;
let classId: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "excl-admin@example.org" });
  adminToken = admin.accessToken;
  const teacherA = await createAndLoginUser(adminToken, {
    email: "excl-teacher-a@example.org",
    displayName: "Teacher A",
    role: "teacher",
  });
  teacherAToken = teacherA.accessToken;
  const teacherB = await createAndLoginUser(adminToken, {
    email: "excl-teacher-b@example.org",
    displayName: "Teacher B",
    role: "teacher",
  });
  teacherBToken = teacherB.accessToken;
  const vieScolaire = await createAndLoginUser(adminToken, {
    email: "excl-vs@example.org",
    displayName: "Vie Scolaire",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;

  // The mock SIS is deterministic and shared with the running Worker (same SCHOOL_ID), so we can
  // read a real student/class pair directly instead of guessing ids.
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

describe("POST /api/v1/exclusions", () => {
  it("creates a pending exclusion with denormalized student/class/teacher names", async () => {
    const response = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherAToken,
    );
    expect(response.status).toBe(201);
    const exclusion = (await response.json()) as Exclusion;
    expect(exclusion.status).toBe("pending");
    expect(exclusion.studentId).toBe(studentId);
    expect(exclusion.classId).toBe(classId);
    expect(exclusion.teacherName).toBe("Teacher A");
    expect(exclusion.acknowledgedAt).toBeNull();
  });

  it("requires a comment when reason is 'other' (400 validation_error)", async () => {
    const response = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "other" },
      teacherAToken,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("404s for an unknown student", async () => {
    const response = await api.post(
      "/api/v1/exclusions",
      { studentId: "does-not-exist", classId, reason: "disruption" },
      teacherAToken,
    );
    expect(response.status).toBe(404);
  });

  it("400s when classId does not match the student's actual class", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    const classes = await provider.listClasses();
    const otherClass = classes.find((c) => c.id !== classId);
    if (otherClass === undefined) throw new Error("expected a second class to exist");
    const response = await api.post(
      "/api/v1/exclusions",
      { studentId, classId: otherClass.id, reason: "disruption" },
      teacherAToken,
    );
    expect(response.status).toBe(400);
  });
});

describe("Full lifecycle happy path: create -> acknowledge -> arrived -> resolved", () => {
  it("walks the whole lifecycle and records a matching audit trail", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "safety", comment: "Bousculade dans le couloir" },
      teacherAToken,
    );
    expect(created.status).toBe(201);
    const exclusion = (await created.json()) as Exclusion;

    const acknowledged = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "acknowledged" },
      vieScolaireToken,
    );
    expect(acknowledged.status).toBe(200);
    const acknowledgedBody = (await acknowledged.json()) as Exclusion;
    expect(acknowledgedBody.status).toBe("acknowledged");
    expect(acknowledgedBody.acknowledgedAt).not.toBeNull();

    const arrived = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "arrived" },
      vieScolaireToken,
    );
    expect(arrived.status).toBe(200);
    const arrivedBody = (await arrived.json()) as Exclusion;
    expect(arrivedBody.status).toBe("arrived");
    expect(arrivedBody.arrivedAt).not.toBeNull();

    const resolved = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "resolved", comment: "Recadré, retour en classe" },
      vieScolaireToken,
    );
    expect(resolved.status).toBe(200);
    const resolvedBody = (await resolved.json()) as Exclusion;
    expect(resolvedBody.status).toBe("resolved");
    expect(resolvedBody.resolvedAt).not.toBeNull();

    // GET /exclusions/:id returns the full, ordered audit trail.
    const detail = await api.get(`/api/v1/exclusions/${exclusion.id}`, vieScolaireToken);
    expect(detail.status).toBe(200);
    const withEvents = (await detail.json()) as ExclusionWithEvents;
    expect(withEvents.events.map((event) => event.type)).toEqual([
      "created",
      "acknowledged",
      "arrived",
      "resolved",
    ]);
    expect(withEvents.events[0]?.actorName).toBe("Teacher A");
    expect(withEvents.events[3]?.comment).toBe("Recadré, retour en classe");
  });
});

describe("Invalid transitions (409 invalid_transition)", () => {
  it("rejects transitioning a resolved exclusion further", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherAToken,
    );
    const exclusion = (await created.json()) as Exclusion;
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

    const invalid = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "acknowledged" },
      vieScolaireToken,
    );
    expect(invalid.status).toBe(409);
    const body = (await invalid.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_transition");
  });

  it("rejects a teacher acknowledging their own exclusion (role not permitted)", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherAToken,
    );
    const exclusion = (await created.json()) as Exclusion;
    const response = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "acknowledged" },
      teacherAToken,
    );
    expect(response.status).toBe(409);
  });

  it("404s a transition on an unknown exclusion id", async () => {
    const response = await api.post(
      "/api/v1/exclusions/does-not-exist/transition",
      { to: "acknowledged" },
      vieScolaireToken,
    );
    expect(response.status).toBe(404);
  });
});

describe("Teacher cancel: own exclusion vs someone else's", () => {
  it("lets the creating teacher cancel their own pending exclusion", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherAToken,
    );
    const exclusion = (await created.json()) as Exclusion;
    const cancelled = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "cancelled" },
      teacherAToken,
    );
    expect(cancelled.status).toBe(200);
    const body = (await cancelled.json()) as Exclusion;
    expect(body.status).toBe("cancelled");
    expect(body.cancelledAt).not.toBeNull();
  });

  it("forbids a different teacher from cancelling (409 invalid_transition)", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherAToken,
    );
    const exclusion = (await created.json()) as Exclusion;
    const cancelled = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "cancelled" },
      teacherBToken,
    );
    expect(cancelled.status).toBe(409);
    const body = (await cancelled.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_transition");
  });

  it("lets the vie scolaire cancel any teacher's exclusion", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherBToken,
    );
    const exclusion = (await created.json()) as Exclusion;
    const cancelled = await api.post(
      `/api/v1/exclusions/${exclusion.id}/transition`,
      { to: "cancelled" },
      vieScolaireToken,
    );
    expect(cancelled.status).toBe(200);
  });
});

describe("GET /api/v1/exclusions (teachers see only their own)", () => {
  it("scopes a teacher's list to exclusions they created", async () => {
    // Both teachers have created several exclusions for `studentId` by this point in the file.
    const asTeacherA = await api.get("/api/v1/exclusions?pageSize=100", teacherAToken);
    expect(asTeacherA.status).toBe(200);
    const bodyA = (await asTeacherA.json()) as { items: Exclusion[] };
    expect(bodyA.items.length).toBeGreaterThan(0);
    expect(bodyA.items.every((item) => item.teacherName === "Teacher A")).toBe(true);
  });

  it("lets the vie scolaire see every teacher's exclusions", async () => {
    const response = await api.get("/api/v1/exclusions?pageSize=100", vieScolaireToken);
    const body = (await response.json()) as { items: Exclusion[] };
    const teacherNames = new Set(body.items.map((item) => item.teacherName));
    expect(teacherNames.has("Teacher A")).toBe(true);
    expect(teacherNames.has("Teacher B")).toBe(true);
  });

  it("forbids a teacher from viewing someone else's exclusion detail", async () => {
    const created = await api.post(
      "/api/v1/exclusions",
      { studentId, classId, reason: "disruption" },
      teacherBToken,
    );
    const exclusion = (await created.json()) as Exclusion;
    const response = await api.get(`/api/v1/exclusions/${exclusion.id}`, teacherAToken);
    expect(response.status).toBe(403);
  });
});
