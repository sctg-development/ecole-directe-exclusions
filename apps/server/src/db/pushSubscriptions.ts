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

/** Repository for the `push_subscriptions` table (one row per device/browser). */

import type { PushPlatform, PushSubscriptionInfo, Role } from "@exclusions/shared";

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  platform: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  platform: PushPlatform;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function mapSubscription(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as PushPlatform,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function toSubscriptionInfo(record: PushSubscriptionRecord): PushSubscriptionInfo {
  return {
    id: record.id,
    platform: record.platform,
    deviceName: record.deviceName,
    createdAt: record.createdAt,
  };
}

/**
 * Idempotent registration: re-posting an existing endpoint/token updates the row in place
 * (same `id`), so a browser refreshing its subscription never creates duplicates.
 */
export async function upsertSubscription(
  db: D1Database,
  subscription: {
    id: string;
    userId: string;
    platform: PushPlatform;
    endpoint: string;
    p256dh: string | null;
    auth: string | null;
    deviceName: string | null;
    createdAt: string;
  },
): Promise<PushSubscriptionRecord> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, device_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         platform = excluded.platform,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         device_name = excluded.device_name`,
    )
    .bind(
      subscription.id,
      subscription.userId,
      subscription.platform,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.deviceName,
      subscription.createdAt,
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?")
    .bind(subscription.endpoint)
    .first<PushSubscriptionRow>();
  if (!row) throw new Error("push subscription upsert failed");
  return mapSubscription(row);
}

/** Deletes a subscription owned by `userId`; returns false when no such row exists. */
export async function deleteSubscriptionForUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Prunes a dead subscription (push service answered 404/410 or FCM UNREGISTERED). */
export async function deleteSubscriptionByEndpoint(
  db: D1Database,
  endpoint: string,
): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

/** Subscriptions of every enabled user holding one of `roles`. */
export async function listSubscriptionsForRoles(
  db: D1Database,
  roles: readonly Role[],
): Promise<PushSubscriptionRecord[]> {
  const placeholders = roles.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT s.* FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE u.disabled = 0 AND u.role IN (${placeholders})`,
    )
    .bind(...roles)
    .all<PushSubscriptionRow>();
  return rows.results.map(mapSubscription);
}

/** Subscriptions of one enabled user (arrival/resolution pushes to the creating teacher). */
export async function listSubscriptionsForUser(
  db: D1Database,
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const rows = await db
    .prepare(
      `SELECT s.* FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE u.disabled = 0 AND s.user_id = ?`,
    )
    .bind(userId)
    .all<PushSubscriptionRow>();
  return rows.results.map(mapSubscription);
}

export async function touchSubscription(db: D1Database, id: string, nowIso: string): Promise<void> {
  await db
    .prepare("UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?")
    .bind(nowIso, id)
    .run();
}
