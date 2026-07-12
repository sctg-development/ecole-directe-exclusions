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

/** Bearer access-token authentication and role gating. */

import type { MiddlewareHandler } from "hono";
import type { Role } from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { errorResponse } from "../lib/errors.js";

/** Verifies `Authorization: Bearer <jwt>` and exposes the caller as `c.get("auth")`. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    return errorResponse(401, "unauthorized", "Missing bearer access token");
  }
  const claims = await verifyAccessToken(header.slice("Bearer ".length), c.env.JWT_SECRET);
  if (claims === null) {
    return errorResponse(401, "unauthorized", "Invalid or expired access token");
  }
  c.set("auth", { userId: claims.sub, role: claims.role, name: claims.name });
  await next();
};

/** Gate for routes restricted to specific roles; must run after `requireAuth`. */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!roles.includes(auth.role)) {
      return errorResponse(403, "forbidden", "Insufficient role for this operation");
    }
    await next();
  };
}
