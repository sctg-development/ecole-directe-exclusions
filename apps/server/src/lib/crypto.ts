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
 * Password hashing and secret comparison, pure WebCrypto (native on Workers).
 * PBKDF2-SHA256 with 210 000 iterations and a per-user 16-byte random salt
 * (see docs/ARCHITECTURE.md, "Authentication").
 */

import { PBKDF2_ITERATIONS } from "@exclusions/shared";
import { base64ToBytes, bytesToBase64, utf8ToBytes } from "./encoding.js";

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BITS = 256;

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", utf8ToBytes(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    PASSWORD_HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Hashes a password with a fresh random salt. Both values are base64 for D1 storage. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePasswordHash(password, salt);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt) };
}

/** Verifies a password against the stored base64 hash + salt, in constant time. */
export async function verifyPassword(
  password: string,
  expectedHashBase64: string,
  saltBase64: string,
): Promise<boolean> {
  const derived = await derivePasswordHash(password, base64ToBytes(saltBase64));
  return constantTimeEqual(derived, base64ToBytes(expectedHashBase64));
}

/** Constant-time byte comparison (no early exit on the first differing byte). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8ToBytes(input));
  return bytesToBase64(new Uint8Array(digest));
}

/**
 * Constant-time string comparison for shared secrets. Both sides are hashed first so the
 * comparison leaks neither content nor length.
 */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", utf8ToBytes(a)),
    crypto.subtle.digest("SHA-256", utf8ToBytes(b)),
  ]);
  return constantTimeEqual(new Uint8Array(digestA), new Uint8Array(digestB));
}
