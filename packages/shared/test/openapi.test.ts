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

import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/openapi.js";

function doc(): ReturnType<typeof buildOpenApiDocument> {
  return buildOpenApiDocument({
    serverUrl: "https://lycee.example/api/v1",
    schoolId: "lycee-example",
    schoolName: "Lycée Example",
  });
}

describe("buildOpenApiDocument", () => {
  it("stamps the OpenAPI 3.2.0 version and server info", () => {
    const result = doc() as Record<string, unknown>;
    expect(result.openapi).toBe("3.2.0");
    const info = result.info as Record<string, unknown>;
    expect(typeof info.title).toBe("string");
    expect(info.version).toBeTruthy();
    const servers = result.servers as Array<{ url: string }>;
    expect(servers[0]?.url).toBe("https://lycee.example/api/v1");
  });

  it("covers every one of the 30 registered operations", () => {
    const paths = doc().paths as Record<string, Record<string, unknown>>;
    const operationCount = Object.values(paths).reduce(
      (total, methods) => total + Object.keys(methods).length,
      0,
    );
    expect(operationCount).toBe(30);
  });

  it("declares the bearer security scheme and applies it to protected routes", () => {
    const result = doc();
    const securitySchemes = (result.components as Record<string, unknown>).securitySchemes as {
      bearerAuth: { type: string; scheme: string };
    };
    expect(securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });

    const paths = result.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(paths["/health"]?.get?.security).toBeUndefined();
    expect(paths["/exclusions/{id}/transition"]?.post?.security).toEqual([{ bearerAuth: [] }]);
  });

  it("references named component schemas via $ref", () => {
    const result = doc();
    const paths = result.paths as Record<string, Record<string, Record<string, unknown>>>;
    const transition = paths["/exclusions/{id}/transition"]?.post as Record<string, unknown>;
    const requestBody = transition.requestBody as {
      content: { "application/json": { schema: { $ref: string } } };
    };
    expect(requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TransitionRequest",
    );

    const schemas = (result.components as Record<string, unknown>).schemas as Record<
      string,
      unknown
    >;
    expect(schemas.TransitionRequest).toBeDefined();
    expect(schemas.Exclusion).toBeDefined();
  });

  it("exposes query parameters for list/stats endpoints", () => {
    const paths = doc().paths as Record<string, Record<string, Record<string, unknown>>>;
    const list = paths["/exclusions"]?.get as Record<string, unknown>;
    const parameters = list.parameters as Array<{ name: string; in: string }>;
    const names = parameters.map((p) => p.name);
    expect(names).toContain("page");
    expect(names).toContain("pageSize");
    expect(parameters.every((p) => p.in === "query")).toBe(true);
  });

  it("declares a text/csv response for the report export", () => {
    const paths = doc().paths as Record<string, Record<string, Record<string, unknown>>>;
    const csv = paths["/reports/exclusions.csv"]?.get as Record<string, unknown>;
    const responses = csv.responses as Record<string, { content?: Record<string, unknown> }>;
    expect(responses["200"]?.content).toHaveProperty("text/csv");
  });

  it("declares the sync API key security scheme and applies it to /sync/* routes", () => {
    const result = doc();
    const securitySchemes = (result.components as Record<string, unknown>).securitySchemes as {
      syncApiKeyAuth: { type: string; in: string; name: string };
    };
    expect(securitySchemes.syncApiKeyAuth).toEqual({
      type: "apiKey",
      in: "header",
      name: "X-Sync-Api-Key",
    });

    const paths = result.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(paths["/sync/classes"]?.put?.security).toEqual([{ syncApiKeyAuth: [] }]);
    expect(paths["/sync/students"]?.put?.security).toEqual([{ syncApiKeyAuth: [] }]);
    expect(paths["/sync/presence"]?.post?.security).toEqual([{ syncApiKeyAuth: [] }]);

    const schemas = (result.components as Record<string, unknown>).schemas as Record<
      string,
      unknown
    >;
    expect(schemas.SyncClassesRequest).toBeDefined();
    expect(schemas.StudentPresence).toBeDefined();
  });

  it("gates the presence-read endpoint behind bearer auth (not the sync API key)", () => {
    const paths = doc().paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(paths["/classes/{id}/presence"]?.get?.security).toEqual([{ bearerAuth: [] }]);
  });
});
