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
 * Repository-level tests for the compare-and-swap guards added to close three races found in
 * code review: concurrent bootstrap (two first admins), concurrent refresh-token rotation
 * (one token minting two live sessions), and concurrent exclusion transitions (a manual action
 * racing the cron escalation sweep). HTTP-level tests can't force true concurrency against a
 * single-threaded test runner, so these exercise the guarded repository functions directly.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Exclusion } from "@exclusions/shared";
import { insertFirstAdmin, insertUser } from "../src/db/users.js";
import { insertRefreshToken, revokeRefreshToken } from "../src/db/refreshTokens.js";
import {
  applyTransitionToExclusion,
  getExclusion,
  insertExclusionStmt,
  updateExclusionStmt,
} from "../src/db/exclusions.js";

function newAdminFixture(email: string) {
  return {
    id: crypto.randomUUID(),
    email,
    displayName: "Admin",
    role: "admin" as const,
    passwordHash: "hash",
    passwordSalt: "salt",
    createdAt: new Date().toISOString(),
  };
}

describe("insertFirstAdmin (bootstrap TOCTOU guard)", () => {
  it("only the first of two concurrent-shaped calls creates a user", async () => {
    const first = await insertFirstAdmin(env.DB, newAdminFixture("first@example.org"));
    const second = await insertFirstAdmin(env.DB, newAdminFixture("second@example.org"));

    expect(first).toBe(true);
    expect(second).toBe(false);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
    expect(count?.n).toBe(1);
    // The user that exists is the one from the winning call, not the loser's.
    const row = await env.DB.prepare("SELECT email FROM users").first<{ email: string }>();
    expect(row?.email).toBe("first@example.org");
  });
});

describe("revokeRefreshToken (refresh-rotation race guard)", () => {
  it("reports true only for the call that actually flips revoked_at", async () => {
    const now = new Date().toISOString();
    const user = newAdminFixture("refresh-race@example.org");
    await insertUser(env.DB, user);
    const tokenId = crypto.randomUUID();
    await insertRefreshToken(env.DB, {
      id: tokenId,
      userId: user.id,
      tokenHash: "some-hash",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      createdAt: now,
    });

    const winner = await revokeRefreshToken(env.DB, tokenId, now);
    const loser = await revokeRefreshToken(env.DB, tokenId, now);

    expect(winner).toBe(true);
    expect(loser).toBe(false);
  });
});

describe("updateExclusionStmt (transition compare-and-swap guard)", () => {
  function fixtureExclusion(id: string, teacherId: string): Exclusion {
    const now = new Date().toISOString();
    return {
      id,
      studentId: "s-1",
      studentName: "DUPONT Alice",
      classId: "c-1",
      className: "2nde A",
      teacherId,
      teacherName: "M. Durand",
      reason: "disruption",
      comment: null,
      status: "pending",
      createdAt: now,
      acknowledgedAt: null,
      arrivedAt: null,
      missingAt: null,
      resolvedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
  }

  it("no-ops when the expected status no longer matches (lost race)", async () => {
    const teacher = newAdminFixture("transition-race@example.org");
    await insertUser(env.DB, teacher);
    const id = crypto.randomUUID();
    const exclusion = fixtureExclusion(id, teacher.id);
    await insertExclusionStmt(env.DB, exclusion).run();

    // Simulates a manual "arrived" transition winning first...
    const arrived = applyTransitionToExclusion(exclusion, "arrived", new Date().toISOString());
    const arrivedResult = await updateExclusionStmt(env.DB, arrived, "pending").run();
    expect(arrivedResult.meta.changes).toBe(1);

    // ...then the cron sweep's stale "missing" write (still guarded by the original "pending"
    // snapshot it read before the manual transition) must be rejected, not silently overwrite it.
    const missing = applyTransitionToExclusion(exclusion, "missing", new Date().toISOString());
    const staleResult = await updateExclusionStmt(env.DB, missing, "pending").run();
    expect(staleResult.meta.changes).toBe(0);

    const stored = await getExclusion(env.DB, id);
    expect(stored?.status).toBe("arrived");
    expect(stored?.arrivedAt).not.toBeNull();
    expect(stored?.missingAt).toBeNull();
  });
});
