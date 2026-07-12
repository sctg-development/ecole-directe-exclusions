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
 * FCM HTTP v1 sender (Android + iOS via Firebase). OAuth2 access tokens are minted from a
 * service-account JWT signed RS256 with WebCrypto and cached in isolate memory until expiry.
 * When `FCM_SERVICE_ACCOUNT` is unset the sender is a logging no-op (`skipped`).
 */

import { base64ToBytes, bytesToBase64Url, utf8ToBytes } from "./encoding.js";
import type { PushSendResult } from "./webpush.js";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** Module-level cache: Workers isolates persist it across requests. */
let cachedToken: { clientEmail: string; token: string; expiresAtMs: number } | null = null;

function parseServiceAccount(json: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (
      typeof parsed.project_id === "string" &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string"
    ) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key,
        token_uri:
          typeof parsed.token_uri === "string"
            ? parsed.token_uri
            : "https://oauth2.googleapis.com/token",
      };
    }
  } catch {
    // fall through
  }
  return null;
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/gu, "");
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(base64),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createServiceAccountJwt(account: ServiceAccount, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: account.token_uri,
    iat,
    exp: iat + 3600,
  };
  const signingInput =
    `${bytesToBase64Url(utf8ToBytes(JSON.stringify(header)))}.` +
    `${bytesToBase64Url(utf8ToBytes(JSON.stringify(claims)))}`;
  const key = await importRsaPrivateKey(account.private_key);
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8ToBytes(signingInput)),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

async function getAccessToken(account: ServiceAccount, now: Date): Promise<string> {
  if (
    cachedToken &&
    cachedToken.clientEmail === account.client_email &&
    cachedToken.expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > now.getTime()
  ) {
    return cachedToken.token;
  }
  const assertion = await createServiceAccountJwt(account, now);
  const response = await fetch(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`FCM OAuth2 token exchange failed with status ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    clientEmail: account.client_email,
    token: data.access_token,
    expiresAtMs: now.getTime() + data.expires_in * 1000,
  };
  return data.access_token;
}

/** Test hook: clears the in-memory OAuth2 token cache. */
export function resetFcmTokenCache(): void {
  cachedToken = null;
}

/**
 * Sends one FCM HTTP v1 message to a device registration token.
 * `gone` (unregistered token) tells the caller to prune the subscription.
 */
export async function sendFcm(
  serviceAccountJson: string | undefined,
  deviceToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  now: Date = new Date(),
): Promise<PushSendResult> {
  if (serviceAccountJson === undefined || serviceAccountJson === "") {
    console.log("FCM sender disabled: FCM_SERVICE_ACCOUNT is not configured");
    return "skipped";
  }
  const account = parseServiceAccount(serviceAccountJson);
  if (!account) {
    console.error("FCM sender misconfigured: FCM_SERVICE_ACCOUNT is not a service-account JSON");
    return "failed";
  }
  const accessToken = await getAccessToken(account, now);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { token: deviceToken, notification, data } }),
    },
  );
  // 404 UNREGISTERED: the token is dead, prune it.
  if (response.status === 404 || response.status === 410) return "gone";
  return response.ok ? "ok" : "failed";
}
