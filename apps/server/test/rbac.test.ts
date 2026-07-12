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

/** Role-based access control: teachers are forbidden from admin/vie-scolaire-only routes. */

import { beforeAll, describe, expect, it } from "vitest";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let adminToken: string;
let teacherToken: string;
let vieScolaireToken: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "rbac-admin@example.org" });
  adminToken = admin.accessToken;
  const teacher = await createAndLoginUser(adminToken, {
    email: "rbac-teacher@example.org",
    displayName: "Teacher",
    role: "teacher",
  });
  teacherToken = teacher.accessToken;
  const vieScolaire = await createAndLoginUser(adminToken, {
    email: "rbac-vs@example.org",
    displayName: "Vie Scolaire",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;
});

describe("GET /api/v1/users (admin only)", () => {
  it("forbids a teacher (403)", async () => {
    const response = await api.get("/api/v1/users", teacherToken);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("forbids a vie-scolaire user (403)", async () => {
    const response = await api.get("/api/v1/users", vieScolaireToken);
    expect(response.status).toBe(403);
  });

  it("allows an admin (200)", async () => {
    const response = await api.get("/api/v1/users", adminToken);
    expect(response.status).toBe(200);
  });

  it("rejects an unauthenticated request (401)", async () => {
    const response = await api.get("/api/v1/users");
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/stats/summary (vie-scolaire + admin only)", () => {
  it("forbids a teacher (403)", async () => {
    const response = await api.get("/api/v1/stats/summary", teacherToken);
    expect(response.status).toBe(403);
  });

  it("allows a vie-scolaire user (200)", async () => {
    const response = await api.get("/api/v1/stats/summary", vieScolaireToken);
    expect(response.status).toBe(200);
  });

  it("allows an admin (200)", async () => {
    const response = await api.get("/api/v1/stats/summary", adminToken);
    expect(response.status).toBe(200);
  });
});

describe("GET /api/v1/exclusions/active (vie-scolaire + admin only)", () => {
  it("forbids a teacher (403)", async () => {
    const response = await api.get("/api/v1/exclusions/active", teacherToken);
    expect(response.status).toBe(403);
  });

  it("allows a vie-scolaire user (200)", async () => {
    const response = await api.get("/api/v1/exclusions/active", vieScolaireToken);
    expect(response.status).toBe(200);
  });
});

describe("GET /api/v1/reports/exclusions.csv (vie-scolaire + admin only)", () => {
  it("forbids a teacher (403)", async () => {
    const response = await api.get("/api/v1/reports/exclusions.csv", teacherToken);
    expect(response.status).toBe(403);
  });
});

describe("A teacher can still use their own routes", () => {
  it("can read /classes and their own /exclusions list", async () => {
    const classes = await api.get("/api/v1/classes", teacherToken);
    expect(classes.status).toBe(200);
    const exclusions = await api.get("/api/v1/exclusions", teacherToken);
    expect(exclusions.status).toBe(200);
  });
});
