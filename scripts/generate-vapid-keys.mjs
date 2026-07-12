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
 * Generates a VAPID (RFC 8292) key pair for Web Push — no dependencies, Node >= 22.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 *
 * Output:
 *   - VAPID_PUBLIC_KEY:  base64url of the uncompressed P-256 public point (65 bytes, 0x04-prefixed)
 *   - VAPID_PRIVATE_KEY: base64url of the 32-byte private scalar (the JWK `d` parameter)
 *
 * Store both as wrangler secrets, one pair per school (see docs/DEPLOYMENT.md).
 * Never commit them. The public key is not sensitive (browsers receive it), but keeping the
 * pair together per environment avoids mismatches.
 */

// Explicit builtin imports keep the script lintable without Node globals in the ESLint config.
import { Buffer } from "node:buffer";
import console from "node:console";
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);

// Uncompressed EC point: 0x04 || X (32 bytes) || Y (32 bytes) = 65 bytes.
const publicRaw = Buffer.from(await subtle.exportKey("raw", keyPair.publicKey));
if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) {
  throw new Error(`Unexpected public key export: ${publicRaw.length} bytes`);
}

// The JWK `d` parameter is already the base64url-encoded 32-byte private scalar.
const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
if (typeof privateJwk.d !== "string" || Buffer.from(privateJwk.d, "base64url").length !== 32) {
  throw new Error("Unexpected private key export: missing or malformed JWK `d`");
}

const publicKey = publicRaw.toString("base64url");
const privateKey = privateJwk.d;

console.log("Generated a fresh VAPID P-256 key pair.\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`
Set them as Worker secrets for a school environment (repeat for each school):

  cd apps/server
  npx wrangler secret put VAPID_PUBLIC_KEY --env <school-id>   # paste the public key
  npx wrangler secret put VAPID_PRIVATE_KEY --env <school-id>  # paste the private key

For local development, put both lines in apps/server/.dev.vars (gitignored) instead.
`);
