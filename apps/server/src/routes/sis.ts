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

/** SIS routes: classes and rosters, served by the configured provider (mock or APLIM). */

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { errorResponse } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createSisProvider } from "../sis/index.js";

export const sisRoutes = new Hono<AppEnv>();

// GET /classes
sisRoutes.get("/classes", requireAuth, async (c) => {
  const provider = createSisProvider(c.env);
  return c.json(await provider.listClasses());
});

// GET /classes/:id/students
sisRoutes.get("/classes/:id/students", requireAuth, async (c) => {
  const provider = createSisProvider(c.env);
  const classId = c.req.param("id");
  const classes = await provider.listClasses();
  if (!classes.some((schoolClass) => schoolClass.id === classId)) {
    return errorResponse(404, "not_found", "Class not found");
  }
  return c.json(await provider.listStudents(classId));
});
