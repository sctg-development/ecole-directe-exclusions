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
 * Syncs the realistic test-school fixture (8 classes, 247 students — regenerate with
 * `npm run generate:test-school-fixture -w @exclusions/server`, see
 * scripts/generate-test-school-fixture.mjs) through the real /api/v1/sync/* endpoints. Unlike
 * sync.test.ts's 1-2 item payloads, this is large enough to exercise the chunked
 * `db.batch()` upserts (BATCH_CHUNK_SIZE = 100 in src/db/classes.ts / students.ts) across
 * multiple chunks (100 + 100 + 47), which a tiny fixture never touches.
 */

import { describe, expect, it } from "vitest";
import type { SyncResult } from "@exclusions/shared";
import testSchoolClasses from "./fixtures/test-school.classes.json" with { type: "json" };
import testSchoolStudents from "./fixtures/test-school.students.json" with { type: "json" };
import testSchoolTeachers from "./fixtures/test-school.teachers.json" with { type: "json" };
import { bootstrapAndLogin, createUser, syncApi } from "./helpers.js";

describe("sync at realistic fixture scale", () => {
  it("has the expected fixture shape (8 classes, 247 students, 12 teachers)", () => {
    expect(testSchoolClasses).toHaveLength(8);
    expect(testSchoolStudents).toHaveLength(247);
    expect(testSchoolTeachers).toHaveLength(12);
    const total = testSchoolClasses.reduce((sum, c) => sum + c.studentCount, 0);
    expect(total).toBe(247);
  });

  it("syncs all 8 classes in one call, spanning a single batch chunk", async () => {
    const response = await syncApi.put("/api/v1/sync/classes", { classes: testSchoolClasses });
    expect(response.status).toBe(200);
    const result = (await response.json()) as SyncResult;
    expect(result.upserted).toBe(8);
  });

  it("syncs all 247 students in one call, spanning three batch chunks (100+100+47)", async () => {
    const response = await syncApi.put("/api/v1/sync/students", { students: testSchoolStudents });
    expect(response.status).toBe(200);
    const result = (await response.json()) as SyncResult;
    expect(result.upserted).toBe(247);
  });

  it("re-syncing the same fixture is idempotent (no unexpected deletes)", async () => {
    const response = await syncApi.put("/api/v1/sync/students", { students: testSchoolStudents });
    const result = (await response.json()) as SyncResult;
    expect(result.upserted).toBe(247);
    expect(result.deleted).toBe(0);
  });

  it("creates the 12 fixture teacher accounts via the admin API", async () => {
    const admin = await bootstrapAndLogin({ email: "fixture-admin@example.org" });
    for (const teacher of testSchoolTeachers) {
      const user = await createUser(admin.accessToken, {
        email: teacher.email,
        displayName: teacher.displayName,
        role: "teacher",
        password: teacher.password,
      });
      expect(user.role).toBe("teacher");
    }
  });
});
