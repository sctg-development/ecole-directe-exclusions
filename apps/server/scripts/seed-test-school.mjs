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
 * Seeds a running Worker (local `wrangler dev` by default) with the realistic test-school
 * fixture: 8 classes, 247 students (via /api/v1/sync/*) and 12 teacher accounts (via the
 * admin-only /api/v1/users). No dependencies, Node >= 22 — plain `fetch`.
 *
 * Requires an existing admin account (bootstrap one first, see docs/API.md or the
 * debug-worker skill) and the deployment's SYNC_API_KEY.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.org ADMIN_PASSWORD=... SYNC_API_KEY=... \
 *     node scripts/seed-test-school.mjs
 *
 * Optional env vars:
 *   BASE_URL   defaults to http://localhost:8787
 */

import console from "node:console";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `fetch` is a Node global (not importable from a `node:` module) — reached via `globalThis`
// so this file stays lintable without adding a Node-globals block to eslint.config.js.
const { fetch } = globalThis;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(SCRIPT_DIR, "..", "test", "fixtures");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8787";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SYNC_API_KEY = process.env.SYNC_API_KEY;

for (const [name, value] of Object.entries({ ADMIN_EMAIL, ADMIN_PASSWORD, SYNC_API_KEY })) {
  if (value === undefined || value === "") {
    console.error(`Missing required env var ${name}. See the docstring in this script.`);
    process.exit(1);
  }
}

async function loadFixture(name) {
  const path = join(FIXTURES_DIR, name);
  return JSON.parse(await readFile(path, "utf8"));
}

async function requestJson(path, options) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  const classes = await loadFixture("test-school.classes.json");
  const students = await loadFixture("test-school.students.json");
  const teachers = await loadFixture("test-school.teachers.json");

  console.log(`Logging in as ${ADMIN_EMAIL}...`);
  const login = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (login.status !== 200) {
    throw new Error(`Admin login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  const adminToken = login.body.accessToken;

  console.log(`Syncing ${classes.length} classes...`);
  const classesResult = await requestJson("/api/v1/sync/classes", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Sync-Api-Key": SYNC_API_KEY },
    body: JSON.stringify({ classes }),
  });
  if (classesResult.status !== 200) {
    throw new Error(
      `Class sync failed (${classesResult.status}): ${JSON.stringify(classesResult.body)}`,
    );
  }
  console.log(`  -> ${JSON.stringify(classesResult.body)}`);

  console.log(`Syncing ${students.length} students...`);
  const studentsResult = await requestJson("/api/v1/sync/students", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Sync-Api-Key": SYNC_API_KEY },
    body: JSON.stringify({ students }),
  });
  if (studentsResult.status !== 200) {
    throw new Error(
      `Student sync failed (${studentsResult.status}): ${JSON.stringify(studentsResult.body)}`,
    );
  }
  console.log(`  -> ${JSON.stringify(studentsResult.body)}`);

  console.log(`Creating ${teachers.length} teacher accounts...`);
  let created = 0;
  let skipped = 0;
  for (const teacher of teachers) {
    const { email, displayName, role, password } = teacher;
    const result = await requestJson("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email, displayName, role, password }),
    });
    if (result.status === 201) {
      created += 1;
    } else if (result.status === 409) {
      skipped += 1; // already created by an earlier run of this script
    } else {
      throw new Error(
        `Failed to create ${email} (${result.status}): ${JSON.stringify(result.body)}`,
      );
    }
  }
  console.log(`  -> ${created} created, ${skipped} already existed`);

  console.log("\nDone. Teacher accounts share the password from the fixture (see");
  console.log("test/fixtures/test-school.teachers.json) — log in as any of their emails.");
}

await main();
