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

/** The 401 → refresh → retry pipeline of the fetch wrapper, including single-flight refresh. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  onUnauthorized,
  setTokens,
} from "../src/api/http.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorizedResponse(): Response {
  return jsonResponse(401, { error: { code: "unauthorized", message: "expired" } });
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe("apiFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    clearTokens();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the access token and parses the JSON body", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hello: "world" }));

    const result = await apiFetch<{ hello: string }>("/api/v1/me");

    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(headerOf(init, "Authorization")).toBe("Bearer access-1");
  });

  it("refreshes once on 401, stores the rotated tokens and retries the request", async () => {
    setTokens("old-access", "old-refresh");
    const urls: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/api/v1/auth/refresh")) {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "old-refresh" });
        return jsonResponse(200, { accessToken: "new-access", refreshToken: "new-refresh" });
      }
      if (headerOf(init, "Authorization") === "Bearer new-access") {
        return jsonResponse(200, { ok: true });
      }
      return unauthorizedResponse();
    });

    const result = await apiFetch<{ ok: boolean }>("/api/v1/me");

    expect(result).toEqual({ ok: true });
    expect(getAccessToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");
    expect(urls.filter((url) => url.endsWith("/api/v1/auth/refresh"))).toHaveLength(1);
    // Original request, refresh, retried request.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares a single refresh between concurrent 401 responses", async () => {
    setTokens("old-access", "old-refresh");
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        await refreshGate; // Hold the refresh so both 401s are observed before it resolves.
        return jsonResponse(200, { accessToken: "new-access", refreshToken: "new-refresh" });
      }
      if (headerOf(init, "Authorization") === "Bearer new-access") {
        return jsonResponse(200, { url });
      }
      return unauthorizedResponse();
    });

    const first = apiFetch<{ url: string }>("/api/v1/one");
    const second = apiFetch<{ url: string }>("/api/v1/two");
    // Let both requests hit their 401 and enqueue on the shared refresh.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(refreshCalls).toBe(1);
    expect(firstResult.url).toContain("/api/v1/one");
    expect(secondResult.url).toContain("/api/v1/two");
    expect(getAccessToken()).toBe("new-access");
  });

  it("clears the session and notifies listeners when the refresh fails", async () => {
    setTokens("old-access", "old-refresh");
    const unauthorizedListener = vi.fn();
    const unsubscribe = onUnauthorized(unauthorizedListener);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        return jsonResponse(401, { error: { code: "unauthorized", message: "revoked" } });
      }
      return unauthorizedResponse();
    });

    await expect(apiFetch("/api/v1/me")).rejects.toBeInstanceOf(ApiError);

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(unauthorizedListener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not attempt a refresh on unauthenticated routes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "invalid_credentials", message: "wrong password" } }),
    );

    await expect(
      apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: { email: "a@b.fr", password: "nope" },
        auth: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_credentials", status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes query parameters, repeating array values", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await apiFetch("/api/v1/exclusions", {
      query: { status: ["pending", "missing"], page: 2, classId: undefined },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/exclusions?status=pending&status=missing&page=2");
  });
});
