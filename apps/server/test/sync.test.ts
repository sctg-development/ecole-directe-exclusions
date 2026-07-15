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

/** Integration tests for the machine-to-machine `/api/v1/sync/*` endpoints. */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { StudentPresence, SyncResult } from "@exclusions/shared";
import { api, bootstrapAndLogin, createAndLoginUser, syncApi } from "./helpers.js";

let vieScolaireToken: string;
let teacherToken: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "sync-admin@example.org" });
  const vieScolaire = await createAndLoginUser(admin.accessToken, {
    email: "sync-vs@example.org",
    displayName: "Sync VS",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;
  const teacher = await createAndLoginUser(admin.accessToken, {
    email: "sync-teacher@example.org",
    displayName: "Sync Teacher",
    role: "teacher",
  });
  teacherToken = teacher.accessToken;
});

describe("sync auth", () => {
  it("rejects a missing X-Sync-Api-Key", async () => {
    const response = await api.post("/api/v1/sync/classes", {
      classes: [{ id: "cls-x", name: "X", level: "Seconde", studentCount: 1 }],
    });
    expect(response.status).toBe(401);
  });

  it("rejects a wrong X-Sync-Api-Key", async () => {
    const response = await syncApi.put(
      "/api/v1/sync/classes",
      { classes: [{ id: "cls-x", name: "X", level: "Seconde", studentCount: 1 }] },
      "wrong-key",
    );
    expect(response.status).toBe(401);
  });
});

describe("sync validation", () => {
  it("rejects an empty classes array", async () => {
    const response = await syncApi.put("/api/v1/sync/classes", { classes: [] });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("rejects an empty students array", async () => {
    const response = await syncApi.put("/api/v1/sync/students", { students: [] });
    expect(response.status).toBe(400);
  });

  it("rejects an empty observations array", async () => {
    const response = await syncApi.post("/api/v1/sync/presence", { observations: [] });
    expect(response.status).toBe(400);
  });
});

describe("sync round trip", () => {
  it("syncs classes, students and presence, then reads them back", async () => {
    const classesResponse = await syncApi.put("/api/v1/sync/classes", {
      classes: [
        { id: "cls-sync-a", name: "Sync A", level: "Seconde", studentCount: 2 },
        { id: "cls-sync-b", name: "Sync B", level: "Première", studentCount: 1 },
      ],
    });
    expect(classesResponse.status).toBe(200);
    const classesResult = (await classesResponse.json()) as SyncResult;
    expect(classesResult.upserted).toBe(2);

    const studentsResponse = await syncApi.put("/api/v1/sync/students", {
      students: [
        {
          id: "stu-sync-1",
          firstName: "Alan",
          lastName: "Turing",
          classId: "cls-sync-a",
          className: "Sync A",
        },
        {
          id: "stu-sync-2",
          firstName: "Grace",
          lastName: "Hopper",
          classId: "cls-sync-a",
          className: "Sync A",
        },
      ],
    });
    expect(studentsResponse.status).toBe(200);
    const studentsResult = (await studentsResponse.json()) as SyncResult;
    expect(studentsResult.upserted).toBe(2);

    const presenceResponse = await syncApi.post("/api/v1/sync/presence", {
      observations: [
        { studentId: "stu-sync-1", present: true, observedAt: new Date().toISOString() },
        { studentId: "stu-sync-2", present: false, observedAt: new Date().toISOString() },
      ],
    });
    expect(presenceResponse.status).toBe(201);
    const presenceResult = (await presenceResponse.json()) as { inserted: number };
    expect(presenceResult.inserted).toBe(2);

    // Note: GET /classes/:id/students goes through the configured SisProvider (mock in this
    // test environment), which knows nothing about synced data — SyncedSisProvider read-through
    // is covered directly in test/sis-synced.test.ts. Presence, however, always reads from the
    // sync tables regardless of SIS_PROVIDER (see routes/sis.ts), so it's exercised here.
    const presenceListResponse = await api.get(
      "/api/v1/classes/cls-sync-a/presence",
      vieScolaireToken,
    );
    expect(presenceListResponse.status).toBe(200);
    const presence = (await presenceListResponse.json()) as StudentPresence[];
    expect(presence).toHaveLength(2);
    const turing = presence.find((p) => p.studentId === "stu-sync-1");
    expect(turing?.present).toBe(true);
    const hopper = presence.find((p) => p.studentId === "stu-sync-2");
    expect(hopper?.present).toBe(false);
  });

  it("deletes classes absent from a subsequent sync", async () => {
    const response = await syncApi.put("/api/v1/sync/classes", {
      classes: [{ id: "cls-sync-a", name: "Sync A", level: "Seconde", studentCount: 2 }],
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as SyncResult;
    expect(result.upserted).toBe(1);
    expect(result.deleted).toBeGreaterThanOrEqual(1); // cls-sync-b, dropped from the payload

    const remaining = await env.DB.prepare("SELECT id FROM classes WHERE id = ?")
      .bind("cls-sync-b")
      .first();
    expect(remaining).toBeNull();
  });
});

describe("presence read authorization", () => {
  it("forbids a teacher from reading class presence", async () => {
    const response = await api.get("/api/v1/classes/cls-sync-a/presence", teacherToken);
    expect(response.status).toBe(403);
  });

  it("404s for an unknown class id", async () => {
    const response = await api.get("/api/v1/classes/does-not-exist/presence", vieScolaireToken);
    expect(response.status).toBe(404);
  });
});
