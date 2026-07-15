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
 * CORS preflight handling for the native Capacitor shells (see index.ts,
 * ALLOWED_CLIENT_ORIGINS). Without this, `OPTIONS /api/v1/*` falls through to the catch-all
 * 404 handler and every request from the iOS/Android app fails before it even sends the real
 * request — the bug this test file guards against.
 */

import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("CORS", () => {
  it("answers an iOS (capacitor://localhost) preflight instead of 404ing", async () => {
    const response = await exports.default.fetch("https://example.com/api/v1/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("answers an Android (https://localhost) preflight the same way", async () => {
    const response = await exports.default.fetch("https://example.com/api/v1/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
  });

  it("tags the real (non-preflight) response with the matching Allow-Origin header too", async () => {
    const response = await exports.default.fetch("https://example.com/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
      body: JSON.stringify({ email: "nobody@example.org", password: "wrong-password" }),
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");
  });

  it("does not grant an unlisted origin the Allow-Origin header", async () => {
    const response = await exports.default.fetch("https://example.com/api/v1/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
