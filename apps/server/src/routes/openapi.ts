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

/** Unauthenticated OpenAPI 3.2.0 document, generated from the shared Zod schemas. */

import { Hono } from "hono";
import { buildOpenApiDocument } from "@exclusions/shared";
import type { AppEnv } from "../env.js";

export const openapiRoutes = new Hono<AppEnv>();

// GET /openapi.json
openapiRoutes.get("/openapi.json", (c) => {
  const url = new URL(c.req.url);
  const doc = buildOpenApiDocument({
    serverUrl: `${url.protocol}//${url.host}/api/v1`,
    schoolId: c.env.SCHOOL_ID,
    schoolName: c.env.SCHOOL_NAME,
  });
  return c.json(doc);
});
