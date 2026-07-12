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
 * Push notification dispatch. Best-effort by design: every failure is logged and swallowed —
 * a lost push never breaks a request, and the dashboard polls as a fallback. Notification
 * texts are French (the end users are French school staff).
 */

import { EXCLUSION_REASONS, EXCLUSION_STATUS_LABELS_FR } from "@exclusions/shared";
import type { Exclusion } from "@exclusions/shared";
import type { Env } from "../env.js";
import {
  deleteSubscriptionByEndpoint,
  listSubscriptionsForRoles,
  listSubscriptionsForUser,
  touchSubscription,
} from "../db/pushSubscriptions.js";
import type { PushSubscriptionRecord } from "../db/pushSubscriptions.js";
import { sendWebPush } from "./webpush.js";
import { sendFcm } from "./fcm.js";

interface PushMessage {
  title: string;
  body: string;
  /** FCM v1 requires string values; the web service worker gets the same map. */
  data: Record<string, string>;
}

async function dispatch(
  env: Env,
  targets: PushSubscriptionRecord[],
  message: PushMessage,
): Promise<void> {
  const payload = JSON.stringify(message);
  const nowIso = new Date().toISOString();

  async function sendOne(target: PushSubscriptionRecord): Promise<void> {
    try {
      let result;
      if (target.platform === "web") {
        if (env.VAPID_PUBLIC_KEY === undefined || env.VAPID_PRIVATE_KEY === undefined) {
          console.log("Web Push disabled: VAPID keys are not configured");
          return;
        }
        if (target.p256dh === null || target.auth === null) {
          console.error(`Web subscription ${target.id} is missing its encryption keys; pruning`);
          await deleteSubscriptionByEndpoint(env.DB, target.endpoint);
          return;
        }
        result = await sendWebPush(
          { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth },
          payload,
          {
            subject: env.VAPID_SUBJECT,
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
          },
        );
      } else {
        result = await sendFcm(
          env.FCM_SERVICE_ACCOUNT,
          target.endpoint,
          { title: message.title, body: message.body },
          message.data,
        );
      }
      if (result === "gone") {
        await deleteSubscriptionByEndpoint(env.DB, target.endpoint);
      } else if (result === "ok") {
        await touchSubscription(env.DB, target.id, nowIso);
      } else if (result === "failed") {
        console.error(`Push delivery to subscription ${target.id} (${target.platform}) failed`);
      }
    } catch (error) {
      console.error(`Push delivery to subscription ${target.id} threw`, error);
    }
  }

  // Every recipient is notified concurrently: this is a real-time alert (a teacher's exclusion
  // report must reach the vie scolaire "immediately"), so one slow/unreachable device must never
  // delay the others.
  await Promise.allSettled(targets.map(sendOne));
}

function reasonLabel(exclusion: Exclusion): string {
  return EXCLUSION_REASONS[exclusion.reason].labelFr;
}

/** New exclusion → every enabled vie-scolaire and admin device. */
export async function notifyNewExclusion(env: Env, exclusion: Exclusion): Promise<void> {
  try {
    const targets = await listSubscriptionsForRoles(env.DB, ["vie-scolaire", "admin"]);
    await dispatch(env, targets, {
      title: "Nouvelle exclusion",
      body:
        `${exclusion.studentName} (${exclusion.className}) a été exclu(e) par ` +
        `${exclusion.teacherName} — ${reasonLabel(exclusion)}.`,
      data: { exclusionId: exclusion.id, type: "created" },
    });
  } catch (error) {
    console.error("notifyNewExclusion failed", error);
  }
}

/** Escalation to `missing` → every enabled vie-scolaire and admin device (re-alert). */
export async function notifyEscalation(env: Env, exclusion: Exclusion): Promise<void> {
  try {
    const targets = await listSubscriptionsForRoles(env.DB, ["vie-scolaire", "admin"]);
    await dispatch(env, targets, {
      title: EXCLUSION_STATUS_LABELS_FR.missing,
      body:
        `${exclusion.studentName} (${exclusion.className}) ne s'est pas présenté(e) ` +
        "à la vie scolaire. Une recherche est nécessaire.",
      data: { exclusionId: exclusion.id, type: "missing" },
    });
  } catch (error) {
    console.error("notifyEscalation failed", error);
  }
}

/** Arrival or resolution → the creating teacher's devices. */
export async function notifyArrivedOrResolved(
  env: Env,
  exclusion: Exclusion,
  kind: "arrived" | "resolved",
): Promise<void> {
  try {
    const targets = await listSubscriptionsForUser(env.DB, exclusion.teacherId);
    const message: PushMessage =
      kind === "arrived"
        ? {
            title: EXCLUSION_STATUS_LABELS_FR.arrived,
            body: `${exclusion.studentName} (${exclusion.className}) est arrivé(e) à la vie scolaire.`,
            data: { exclusionId: exclusion.id, type: "arrived" },
          }
        : {
            title: "Exclusion clôturée",
            body: `L'exclusion de ${exclusion.studentName} (${exclusion.className}) a été clôturée.`,
            data: { exclusionId: exclusion.id, type: "resolved" },
          };
    await dispatch(env, targets, message);
  } catch (error) {
    console.error("notifyArrivedOrResolved failed", error);
  }
}
