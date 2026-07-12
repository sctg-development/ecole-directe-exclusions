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
 * Push notification registration for the three platforms:
 * - Native (Capacitor Android/iOS): FCM token via `@capacitor/push-notifications`.
 * - Web/PWA: service worker + Web Push (VAPID).
 * Degrades gracefully with French user-facing messages (e.g. iOS Safari outside the PWA).
 */

import { Capacitor } from "@capacitor/core";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "../api/endpoints.js";
import { t } from "../i18n/fr.js";

/** localStorage key of the server-side subscription id (needed to DELETE on opt-out). */
const SUBSCRIPTION_ID_KEY = "exclusions.pushSubscriptionId";

export type PushResult = { ok: true } | { ok: false; message: string };

/** Decodes a base64url VAPID public key into the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** True when this device currently has an active registration recorded. */
export function isPushEnabled(): boolean {
  return localStorage.getItem(SUBSCRIPTION_ID_KEY) !== null;
}

function rememberSubscription(id: string | undefined): void {
  if (id) localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
}

async function forgetSubscription(): Promise<void> {
  const id = localStorage.getItem(SUBSCRIPTION_ID_KEY);
  localStorage.removeItem(SUBSCRIPTION_ID_KEY);
  if (id !== null) {
    try {
      await unsubscribePush(id);
    } catch {
      // Best-effort: the server prunes dead subscriptions on send anyway.
    }
  }
}

// --- Native (Capacitor) ---

async function enableNativePush(): Promise<PushResult> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    return { ok: false, message: t.push.permissionDenied };
  }
  // Listeners must be attached — and their subscription awaited — before `register()` is
  // called: `addListener` is asynchronous over the native bridge, so calling `register()`
  // without awaiting it first can let the native "registration" event fire before the JS
  // listener is subscribed, silently dropping it until the timeout below fires a false error.
  // Each handle is removed once it fires (or the whole thing times out) so repeated
  // enable/disable cycles don't accumulate listeners for the life of the WebView.
  const token = await new Promise<string>((resolve, reject) => {
    void (async () => {
      const registrationHandle = await PushNotifications.addListener(
        "registration",
        (registration) => {
          clearTimeout(timer);
          void registrationHandle.remove();
          void registrationErrorHandle.remove();
          resolve(registration.value);
        },
      );
      const registrationErrorHandle = await PushNotifications.addListener(
        "registrationError",
        (error) => {
          clearTimeout(timer);
          void registrationHandle.remove();
          void registrationErrorHandle.remove();
          reject(new Error(error.error));
        },
      );
      const timer = setTimeout(() => {
        void registrationHandle.remove();
        void registrationErrorHandle.remove();
        reject(new Error("registration timeout"));
      }, 20_000);
      await PushNotifications.register();
    })();
  });
  const platform = Capacitor.getPlatform() === "ios" ? ("ios" as const) : ("android" as const);
  const info = await subscribePush({ platform, token });
  rememberSubscription(info?.id);
  return { ok: true };
}

// --- Web / PWA ---

function isWebPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function enableWebPush(): Promise<PushResult> {
  if (!isWebPushSupported()) {
    // Typically iOS Safari when the app is not installed on the home screen.
    return { ok: false, message: t.push.unsupported };
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: t.push.permissionDenied };
  }
  const { publicKey } = await getVapidPublicKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!json.endpoint || !p256dh || !auth) {
    return { ok: false, message: t.push.error };
  }
  const info = await subscribePush({
    platform: "web",
    subscription: { endpoint: json.endpoint, keys: { p256dh, auth } },
  });
  rememberSubscription(info?.id);
  return { ok: true };
}

// --- Public API ---

/** Registers this device for push notifications. Never throws: failures return a message. */
export async function enablePush(): Promise<PushResult> {
  try {
    return Capacitor.isNativePlatform() ? await enableNativePush() : await enableWebPush();
  } catch {
    return { ok: false, message: t.push.error };
  }
}

/** Unregisters this device (browser unsubscribe / FCM unregister + server-side delete). */
export async function disablePush(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.unregister();
    } else if (isWebPushSupported()) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    }
  } catch {
    // The server-side subscription is removed below regardless.
  }
  await forgetSubscription();
}

/**
 * Deep-links native notification taps: the push payload carries `data.url`
 * (e.g. `/exclusions/<id>`). The web equivalent lives in `public/sw.js` (`notificationclick`).
 */
export async function initNativePushDeepLinks(navigate: (path: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as { url?: unknown } | undefined;
    const url = typeof data?.url === "string" && data.url.startsWith("/") ? data.url : "/";
    navigate(url);
  });
}
