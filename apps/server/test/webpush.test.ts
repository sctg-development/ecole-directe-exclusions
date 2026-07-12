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
 * Unit tests for `lib/webpush.ts`:
 * - RFC 8291 round trip: encrypt as the application server, then decrypt with the inverse
 *   HKDF/AES-GCM derivation as the browser (user agent) would, using a locally generated P-256
 *   keypair + auth secret standing in for a real `PushSubscription`.
 * - RFC 8292 VAPID JWT: header/claims shape and ECDSA signature validity.
 */

import { describe, expect, it } from "vitest";
import { createVapidJwt, encryptWebPushPayload } from "../src/lib/webpush.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  utf8ToBytes,
} from "../src/lib/encoding.js";

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

/** Inverse of `encryptWebPushPayload`, played by the user agent (browser) side. */
async function decryptWebPush(
  body: Uint8Array,
  uaPrivateKey: CryptoKey,
  uaPublicKeyRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idLen = body[20] ?? 0;
  const asPublicRaw = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);

  const asPublicKey = await crypto.subtle.importKey(
    "raw",
    asPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // See src/lib/webpush.ts: workers-types mistypes this as `$public`; the runtime wants `public`.
  const ecdhParams = {
    name: "ECDH",
    public: asPublicKey,
  } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, uaPrivateKey, 256));

  const keyInfo = concatBytes(utf8ToBytes("WebPush: info\0"), uaPublicKeyRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const contentEncryptionKey = await hkdf(
    salt,
    ikm,
    utf8ToBytes("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(salt, ikm, utf8ToBytes("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, [
    "decrypt",
  ]);
  const recordBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ciphertext);
  const record = new Uint8Array(recordBuf);

  // RFC 8188: strip trailing zero padding, then the 0x01/0x02 delimiter octet.
  let end = record.length;
  while (end > 0 && record[end - 1] === 0) end--;
  return record.slice(0, end - 1);
}

async function generateUaKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyRaw: Uint8Array;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publicKeyRaw = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );
  return { keyPair, publicKeyRaw };
}

describe("encryptWebPushPayload (RFC 8291 aes128gcm)", () => {
  it("round-trips a JSON notification payload", async () => {
    const { keyPair, publicKeyRaw } = await generateUaKeyPair();
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const plaintext = utf8ToBytes(JSON.stringify({ title: "Nouvelle exclusion", body: "Test" }));

    const encrypted = await encryptWebPushPayload(plaintext, publicKeyRaw, authSecret);
    const decrypted = await decryptWebPush(encrypted, keyPair.privateKey, publicKeyRaw, authSecret);

    expect(new TextDecoder().decode(decrypted)).toBe(
      JSON.stringify({ title: "Nouvelle exclusion", body: "Test" }),
    );
  });

  it("produces a well-formed aes128gcm header (salt/rs/idlen/as_public)", async () => {
    const { publicKeyRaw } = await generateUaKeyPair();
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await encryptWebPushPayload(utf8ToBytes("x"), publicKeyRaw, authSecret);

    expect(encrypted.length).toBeGreaterThan(16 + 4 + 1 + 65);
    const recordSize = new DataView(encrypted.buffer, encrypted.byteOffset).getUint32(16);
    expect(recordSize).toBe(4096);
    const idLen = encrypted[20];
    expect(idLen).toBe(65); // uncompressed P-256 point
    const asPublic = encrypted.slice(21, 21 + 65);
    expect(asPublic[0]).toBe(0x04); // uncompressed point marker
  });

  it("fails to decrypt with the wrong auth secret", async () => {
    const { keyPair, publicKeyRaw } = await generateUaKeyPair();
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const wrongSecret = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await encryptWebPushPayload(utf8ToBytes("secret"), publicKeyRaw, authSecret);

    await expect(
      decryptWebPush(encrypted, keyPair.privateKey, publicKeyRaw, wrongSecret),
    ).rejects.toThrow();
  });
});

describe("createVapidJwt (RFC 8292)", () => {
  // A P-256 keypair in the base64url raw format the VAPID helper expects.
  async function generateVapidKeys(): Promise<{
    publicKey: string;
    privateKey: string;
    cryptoKey: CryptoKey;
  }> {
    const keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const publicRaw = new Uint8Array(
      (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
    );
    const jwk = (await crypto.subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;
    if (jwk.d === undefined) throw new Error("expected a private scalar");
    return {
      publicKey: bytesToBase64Url(publicRaw),
      privateKey: jwk.d,
      cryptoKey: keyPair.publicKey,
    };
  }

  it("produces a JWT with the expected header and claims", async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    const now = new Date("2026-07-09T08:00:00.000Z");
    const jwt = await createVapidJwt(
      "https://push.example.org/subscription/abc",
      "mailto:ops@example.org",
      publicKey,
      privateKey,
      now,
    );

    const [headerB64, claimsB64, signatureB64] = jwt.split(".");
    expect(headerB64).toBeDefined();
    expect(claimsB64).toBeDefined();
    expect(signatureB64).toBeDefined();

    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64 ?? ""))) as {
      typ: string;
      alg: string;
    };
    expect(header).toEqual({ typ: "JWT", alg: "ES256" });

    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(claimsB64 ?? ""))) as {
      aud: string;
      sub: string;
      exp: number;
    };
    expect(claims.aud).toBe("https://push.example.org");
    expect(claims.sub).toBe("mailto:ops@example.org");
    expect(claims.exp).toBeGreaterThan(Math.floor(now.getTime() / 1000));
  });

  it("signs with a signature verifiable by the matching public key", async () => {
    const { publicKey, privateKey, cryptoKey } = await generateVapidKeys();
    const jwt = await createVapidJwt(
      "https://push.example.org/x",
      "mailto:ops@example.org",
      publicKey,
      privateKey,
    );
    const [headerB64, claimsB64, signatureB64] = jwt.split(".");
    const signingInput = utf8ToBytes(`${headerB64}.${claimsB64}`);
    const signature = base64UrlToBytes(signatureB64 ?? "");

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signature,
      signingInput,
    );
    expect(valid).toBe(true);
  });

  it("rejects a malformed VAPID public key", async () => {
    await expect(
      createVapidJwt(
        "https://push.example.org/x",
        "mailto:ops@example.org",
        "not-a-valid-point",
        "AA",
      ),
    ).rejects.toThrow();
  });
});
