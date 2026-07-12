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
 * Token issuing and verification.
 * - Access tokens: JWT HS256 via `hono/jwt`, 15-minute TTL, claims `sub`/`role`/`name`.
 * - Refresh tokens: opaque 256-bit random values, stored SHA-256-hashed in D1, 14-day TTL,
 *   rotated on every refresh (see docs/ARCHITECTURE.md).
 */

import { sign, verify } from "hono/jwt";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, roleSchema } from "@exclusions/shared";
import type { Role } from "@exclusions/shared";
import { sha256Base64 } from "./crypto.js";
import { bytesToBase64Url } from "./encoding.js";

const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  name: string;
}

export async function signAccessToken(
  user: { id: string; role: Role; displayName: string },
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return sign(
    {
      sub: user.id,
      role: user.role,
      name: user.displayName,
      iat,
      exp: iat + ACCESS_TOKEN_TTL_SECONDS,
    },
    secret,
    "HS256",
  );
}

/** Returns the verified claims, or `null` for any invalid/expired/malformed token. */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | null> {
  try {
    const payload = await verify(token, secret, "HS256");
    const { sub, role, name } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || typeof role !== "string" || typeof name !== "string") {
      return null;
    }
    const roleResult = roleSchema.safeParse(role);
    if (!roleResult.success) return null;
    return { sub, role: roleResult.data, name };
  } catch {
    return null;
  }
}

/** Opaque refresh token: 32 random bytes, base64url. Only its SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_BYTES)));
}

export async function hashRefreshToken(token: string): Promise<string> {
  return sha256Base64(token);
}

export function refreshTokenExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
}
