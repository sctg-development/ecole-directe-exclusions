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
 * Vitest + @cloudflare/vitest-pool-workers: every test runs inside workerd against an
 * in-memory D1 migrated by test/apply-migrations.ts (official readD1Migrations pattern).
 * Tests use a stripped wrangler config (test/wrangler.test.jsonc) with no static-assets
 * binding, so they never depend on ../client/dist existing.
 *
 * This version of `@cloudflare/vitest-pool-workers` (0.18.x) configures itself through a Vite
 * plugin (`cloudflareTest`) rather than the older `defineWorkersConfig`/`poolOptions.workers`
 * shape — there is no `@cloudflare/vitest-pool-workers/config` entry point in this version.
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrationsPath = fileURLToPath(new URL("./migrations", import.meta.url));
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./test/wrangler.test.jsonc" },
        miniflare: {
          // Consumed by test/apply-migrations.ts via the TEST_MIGRATIONS binding.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  };
});
