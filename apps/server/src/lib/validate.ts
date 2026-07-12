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
 * Manual request validation with the shared Zod schemas (`@hono/zod-validator` is deliberately
 * not a dependency). Every failure produces a 400 `validation_error` response.
 */

import type { z } from "zod";
import { errorResponse } from "./errors.js";

export type ParseOutcome<T> = { ok: true; data: T } | { ok: false; response: Response };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
}

/** Validates arbitrary input (parsed body, query object) against a schema. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ParseOutcome<z.output<S>> {
  const result = schema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      response: errorResponse(400, "validation_error", formatIssues(result.error)),
    };
  }
  return { ok: true, data: result.data };
}

/** Reads and validates a JSON request body; malformed JSON is a 400 `validation_error`. */
export async function parseJsonBody<S extends z.ZodType>(
  request: { json: () => Promise<unknown> },
  schema: S,
): Promise<ParseOutcome<z.output<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "validation_error", "Request body must be valid JSON"),
    };
  }
  return parseWith(schema, body);
}
