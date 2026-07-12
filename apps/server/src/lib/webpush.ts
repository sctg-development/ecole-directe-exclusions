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
 * Web Push, pure WebCrypto (no Node APIs):
 * - RFC 8291 message encryption (`aes128gcm` content encoding, single record).
 * - RFC 8292 VAPID authentication (ES256 JWT, `vapid t=..., k=...` scheme).
 */

import { base64UrlToBytes, bytesToBase64Url, concatBytes, utf8ToBytes } from "./encoding.js";

/** Outcome of one push delivery attempt. `gone` means the subscription must be pruned. */
export type PushSendResult = "ok" | "gone" | "failed" | "skipped";

export interface WebPushTarget {
  /** Push service endpoint URL. */
  endpoint: string;
  /** Client public key (base64url, 65-byte uncompressed P-256 point). */
  p256dh: string;
  /** Client auth secret (base64url, 16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** `sub` claim, e.g. "mailto:ops@example.org". */
  subject: string;
  /** base64url uncompressed P-256 public point (65 bytes). */
  publicKey: string;
  /** base64url P-256 private scalar (32 bytes). */
  privateKey: string;
}

const RECORD_SIZE = 4096;
const VAPID_JWT_TTL_SECONDS = 12 * 3600; // RFC 8292 caps `exp` at 24 h; 12 h is comfortable.
const DEFAULT_PUSH_TTL_SECONDS = 300;

/** One combined HKDF-SHA256 extract+expand, as WebCrypto exposes it. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  byteLength: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    byteLength * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypts `plaintext` for a subscription per RFC 8291 (`aes128gcm`). Returns the full HTTP
 * body: `salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext`. The payload must fit a
 * single record, which push services guarantee for <= 3.8 kB notifications.
 */
export async function encryptWebPushPayload(
  plaintext: Uint8Array,
  uaPublicKeyRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  // Ephemeral application-server ECDH key pair (the `keyid` of the encrypted record).
  const asKeyPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicKeyRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // `@cloudflare/workers-types` types this parameter as `$public` (see `SubtleCryptoDeriveKeyAlgorithm`),
  // but the workerd runtime actually reads the standard Web Crypto `public` property — the `$public`
  // name is a type-only quirk. Build the real object, then satisfy the (mistyped) signature.
  const ecdhDeriveParams = {
    name: "ECDH",
    public: uaPublicKey,
  } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhDeriveParams, asKeyPair.privateKey, 256),
  );
  const asPublicRaw = new Uint8Array(
    (await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer,
  );

  // RFC 8291 §3.3-3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_pub || as_pub, 32)
  const keyInfo = concatBytes(utf8ToBytes("WebPush: info\0"), uaPublicKeyRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentEncryptionKey = await hkdf(
    salt,
    ikm,
    utf8ToBytes("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(salt, ikm, utf8ToBytes("Content-Encoding: nonce\0"), 12);

  // RFC 8188: the (single, last) record is plaintext || 0x02 padding delimiter.
  const record = concatBytes(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);
  return concatBytes(header, ciphertext);
}

/**
 * RFC 8292 VAPID JWT (ES256): `aud` is the push-service origin, `sub` identifies the sender.
 * The private key is the raw 32-byte P-256 scalar; the public key the 65-byte point (both
 * base64url — the format produced by common VAPID key generators).
 */
export async function createVapidJwt(
  endpoint: string,
  subject: string,
  publicKeyBase64Url: string,
  privateKeyBase64Url: string,
  now: Date = new Date(),
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: Math.floor(now.getTime() / 1000) + VAPID_JWT_TTL_SECONDS,
    sub: subject,
  };
  const signingInput =
    `${bytesToBase64Url(utf8ToBytes(JSON.stringify(header)))}.` +
    `${bytesToBase64Url(utf8ToBytes(JSON.stringify(claims)))}`;

  const publicPoint = base64UrlToBytes(publicKeyBase64Url);
  if (publicPoint.length !== 65 || publicPoint[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicPoint.slice(1, 33)),
    y: bytesToBase64Url(publicPoint.slice(33, 65)),
    d: privateKeyBase64Url,
  };
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto ECDSA signatures are already the raw r||s concatenation JWS requires.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8ToBytes(signingInput),
    ),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/** Sends one Web Push notification. Never throws for delivery errors — returns a result. */
export async function sendWebPush(
  target: WebPushTarget,
  payload: string,
  vapid: VapidKeys,
  ttlSeconds: number = DEFAULT_PUSH_TTL_SECONDS,
): Promise<PushSendResult> {
  const body = await encryptWebPushPayload(
    utf8ToBytes(payload),
    base64UrlToBytes(target.p256dh),
    base64UrlToBytes(target.auth),
  );
  const jwt = await createVapidJwt(
    target.endpoint,
    vapid.subject,
    vapid.publicKey,
    vapid.privateKey,
  );
  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      TTL: String(ttlSeconds),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Urgency: "high",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return "gone";
  return response.ok ? "ok" : "failed";
}
