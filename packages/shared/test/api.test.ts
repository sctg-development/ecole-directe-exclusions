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

import { describe, expect, it } from "vitest";
import {
  createExclusionRequestSchema,
  createUserRequestSchema,
  listExclusionsQuerySchema,
  loginRequestSchema,
  pushSubscribeRequestSchema,
  syncClassesRequestSchema,
  syncPresenceRequestSchema,
  syncStudentsRequestSchema,
  transitionRequestSchema,
} from "../src/api.js";

describe("loginRequestSchema", () => {
  it("accepts a valid login", () => {
    expect(
      loginRequestSchema.safeParse({ email: "prof@lycee.fr", password: "s3cret-pass" }).success,
    ).toBe(true);
  });

  it("rejects a malformed e-mail", () => {
    expect(loginRequestSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
});

describe("createUserRequestSchema", () => {
  it("enforces the minimum password length", () => {
    const result = createUserRequestSchema.safeParse({
      email: "cpe@lycee.fr",
      displayName: "Vie Scolaire",
      role: "vie-scolaire",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("createExclusionRequestSchema", () => {
  const base = { studentId: "stu-1", classId: "cls-1" };

  it("accepts a standard reason without comment", () => {
    expect(createExclusionRequestSchema.safeParse({ ...base, reason: "disruption" }).success).toBe(
      true,
    );
  });

  it("requires a comment when reason is 'other'", () => {
    expect(createExclusionRequestSchema.safeParse({ ...base, reason: "other" }).success).toBe(
      false,
    );
    expect(
      createExclusionRequestSchema.safeParse({ ...base, reason: "other", comment: "détail" })
        .success,
    ).toBe(true);
  });

  it("rejects unknown reasons", () => {
    expect(createExclusionRequestSchema.safeParse({ ...base, reason: "boredom" }).success).toBe(
      false,
    );
  });
});

describe("transitionRequestSchema", () => {
  it("accepts a valid target status", () => {
    expect(transitionRequestSchema.safeParse({ to: "acknowledged" }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(transitionRequestSchema.safeParse({ to: "vanished" }).success).toBe(false);
  });
});

describe("listExclusionsQuerySchema", () => {
  it("applies pagination defaults", () => {
    const parsed = listExclusionsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it("normalizes a single status into an array", () => {
    const parsed = listExclusionsQuerySchema.parse({ status: "pending" });
    expect(parsed.status).toEqual(["pending"]);
  });

  it("keeps repeated statuses as an array", () => {
    const parsed = listExclusionsQuerySchema.parse({ status: ["pending", "missing"] });
    expect(parsed.status).toEqual(["pending", "missing"]);
  });

  it("coerces numeric strings from the query string", () => {
    const parsed = listExclusionsQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it("accepts date-only and full ISO datetimes", () => {
    expect(listExclusionsQuerySchema.safeParse({ from: "2026-09-01" }).success).toBe(true);
    expect(listExclusionsQuerySchema.safeParse({ from: "2026-09-01T08:00:00+02:00" }).success).toBe(
      true,
    );
    expect(listExclusionsQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });
});

describe("pushSubscribeRequestSchema", () => {
  it("accepts a web push subscription", () => {
    const result = pushSubscribeRequestSchema.safeParse({
      platform: "web",
      subscription: {
        endpoint: "https://push.example.com/sub/abc",
        keys: { p256dh: "key", auth: "secret" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an FCM token for android/ios", () => {
    expect(
      pushSubscribeRequestSchema.safeParse({ platform: "android", token: "fcm-token" }).success,
    ).toBe(true);
    expect(
      pushSubscribeRequestSchema.safeParse({ platform: "ios", token: "fcm-token" }).success,
    ).toBe(true);
  });

  it("rejects a web subscription without keys", () => {
    expect(
      pushSubscribeRequestSchema.safeParse({
        platform: "web",
        subscription: { endpoint: "https://push.example.com/sub/abc" },
      }).success,
    ).toBe(false);
  });

  it("rejects an android subscription without token", () => {
    expect(pushSubscribeRequestSchema.safeParse({ platform: "android" }).success).toBe(false);
  });
});

describe("syncClassesRequestSchema", () => {
  it("accepts a non-empty class list", () => {
    const result = syncClassesRequestSchema.safeParse({
      classes: [{ id: "cls-1", name: "Terminale A", level: "Terminale", studentCount: 30 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty class list", () => {
    expect(syncClassesRequestSchema.safeParse({ classes: [] }).success).toBe(false);
  });
});

describe("syncStudentsRequestSchema", () => {
  it("accepts a non-empty student list", () => {
    const result = syncStudentsRequestSchema.safeParse({
      students: [
        { id: "stu-1", firstName: "Ada", lastName: "Lovelace", classId: "cls-1", className: "T A" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty student list", () => {
    expect(syncStudentsRequestSchema.safeParse({ students: [] }).success).toBe(false);
  });
});

describe("syncPresenceRequestSchema", () => {
  it("accepts a valid observation batch", () => {
    const result = syncPresenceRequestSchema.safeParse({
      observations: [{ studentId: "stu-1", present: true, observedAt: "2026-09-01T08:00:00Z" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty observation batch", () => {
    expect(syncPresenceRequestSchema.safeParse({ observations: [] }).success).toBe(false);
  });

  it("rejects a malformed observedAt", () => {
    const result = syncPresenceRequestSchema.safeParse({
      observations: [{ studentId: "stu-1", present: true, observedAt: "not-a-date" }],
    });
    expect(result.success).toBe(false);
  });
});
