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

/** Push subscription routes: idempotent upsert, ownership-scoped delete, VAPID public key. */

import { beforeAll, describe, expect, it } from "vitest";
import type { PushSubscriptionInfo } from "@exclusions/shared";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let teacherAToken: string;
let teacherBToken: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "push-admin@example.org" });
  const teacherA = await createAndLoginUser(admin.accessToken, {
    email: "push-teacher-a@example.org",
    displayName: "Push Teacher A",
    role: "teacher",
  });
  teacherAToken = teacherA.accessToken;
  const teacherB = await createAndLoginUser(admin.accessToken, {
    email: "push-teacher-b@example.org",
    displayName: "Push Teacher B",
    role: "teacher",
  });
  teacherBToken = teacherB.accessToken;
});

describe("POST /api/v1/push/subscriptions", () => {
  it("registers a web subscription (201)", async () => {
    const response = await api.post(
      "/api/v1/push/subscriptions",
      {
        platform: "web",
        subscription: {
          endpoint: "https://push.example.org/subscription/aaa",
          keys: { p256dh: "p256dh-value-aaa", auth: "auth-value-aaa" },
        },
        deviceName: "Tablette salle 12",
      },
      teacherAToken,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as PushSubscriptionInfo;
    expect(body.platform).toBe("web");
    expect(body.deviceName).toBe("Tablette salle 12");
  });

  it("registers an android FCM token subscription (201)", async () => {
    const response = await api.post(
      "/api/v1/push/subscriptions",
      { platform: "android", token: "fcm-token-bbb" },
      teacherAToken,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as PushSubscriptionInfo;
    expect(body.platform).toBe("android");
  });

  it("is idempotent: re-posting the same endpoint updates the existing row instead of duplicating", async () => {
    const first = await api.post(
      "/api/v1/push/subscriptions",
      {
        platform: "web",
        subscription: {
          endpoint: "https://push.example.org/subscription/idempotent",
          keys: { p256dh: "p256dh-1", auth: "auth-1" },
        },
        deviceName: "First name",
      },
      teacherAToken,
    );
    const firstBody = (await first.json()) as PushSubscriptionInfo;

    const second = await api.post(
      "/api/v1/push/subscriptions",
      {
        platform: "web",
        subscription: {
          endpoint: "https://push.example.org/subscription/idempotent",
          keys: { p256dh: "p256dh-2", auth: "auth-2" },
        },
        deviceName: "Updated name",
      },
      teacherAToken,
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as PushSubscriptionInfo;
    // Same underlying row (upsert on endpoint), with the updated device name.
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.deviceName).toBe("Updated name");
  });

  it("rejects a malformed subscription body (400 validation_error)", async () => {
    const response = await api.post(
      "/api/v1/push/subscriptions",
      { platform: "web", subscription: { endpoint: "not-a-url" } },
      teacherAToken,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });
});

describe("DELETE /api/v1/push/subscriptions/:id", () => {
  it("deletes a subscription the caller owns (204)", async () => {
    const created = await api.post(
      "/api/v1/push/subscriptions",
      { platform: "ios", token: "fcm-token-to-delete" },
      teacherAToken,
    );
    const { id } = (await created.json()) as PushSubscriptionInfo;

    const deleted = await api.delete(`/api/v1/push/subscriptions/${id}`, teacherAToken);
    expect(deleted.status).toBe(204);
  });

  it("404s deleting a subscription owned by someone else", async () => {
    const created = await api.post(
      "/api/v1/push/subscriptions",
      { platform: "ios", token: "fcm-token-owned-by-a" },
      teacherAToken,
    );
    const { id } = (await created.json()) as PushSubscriptionInfo;

    const deletedByB = await api.delete(`/api/v1/push/subscriptions/${id}`, teacherBToken);
    expect(deletedByB.status).toBe(404);
  });

  it("404s deleting an unknown subscription id", async () => {
    const response = await api.delete("/api/v1/push/subscriptions/does-not-exist", teacherAToken);
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/push/vapid-public-key", () => {
  it("returns the configured VAPID public key", async () => {
    const response = await api.get("/api/v1/push/vapid-public-key", teacherAToken);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { publicKey: string };
    expect(body.publicKey).toBeTruthy();
  });

  it("requires authentication (401)", async () => {
    const response = await api.get("/api/v1/push/vapid-public-key");
    expect(response.status).toBe(401);
  });
});
