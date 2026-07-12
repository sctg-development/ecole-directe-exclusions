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

/** Push subscription routes: idempotent registration, removal, and the VAPID public key. */

import { Hono } from "hono";
import { pushSubscribeRequestSchema } from "@exclusions/shared";
import type { VapidPublicKeyResponse } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { errorResponse } from "../lib/errors.js";
import { parseJsonBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  deleteSubscriptionForUser,
  toSubscriptionInfo,
  upsertSubscription,
} from "../db/pushSubscriptions.js";

export const pushRoutes = new Hono<AppEnv>();

// POST /push/subscriptions — idempotent: re-posting an endpoint/token updates the row.
pushRoutes.post("/push/subscriptions", requireAuth, async (c) => {
  const parsed = await parseJsonBody(c.req, pushSubscribeRequestSchema);
  if (!parsed.ok) return parsed.response;
  const auth = c.get("auth");
  const body = parsed.data;

  const record = await upsertSubscription(c.env.DB, {
    id: crypto.randomUUID(),
    userId: auth.userId,
    platform: body.platform,
    endpoint: body.platform === "web" ? body.subscription.endpoint : body.token,
    p256dh: body.platform === "web" ? body.subscription.keys.p256dh : null,
    auth: body.platform === "web" ? body.subscription.keys.auth : null,
    deviceName: body.deviceName ?? null,
    createdAt: new Date().toISOString(),
  });
  return c.json(toSubscriptionInfo(record), 201);
});

// DELETE /push/subscriptions/:id — a user can only remove their own device.
pushRoutes.delete("/push/subscriptions/:id", requireAuth, async (c) => {
  const deleted = await deleteSubscriptionForUser(
    c.env.DB,
    c.req.param("id"),
    c.get("auth").userId,
  );
  if (!deleted) return errorResponse(404, "not_found", "Subscription not found");
  return c.body(null, 204);
});

// GET /push/vapid-public-key — served to the web client before it subscribes.
pushRoutes.get("/push/vapid-public-key", requireAuth, (c) => {
  const publicKey = c.env.VAPID_PUBLIC_KEY;
  if (publicKey === undefined || publicKey === "") {
    return errorResponse(404, "not_found", "Web Push is not configured on this deployment");
  }
  const body: VapidPublicKeyResponse = { publicKey };
  return c.json(body);
});
