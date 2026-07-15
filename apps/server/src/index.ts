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
 * Worker entry point: Hono app wiring (REST API under /api/v1) plus the cron handler.
 * Non-API paths are served by the static-assets binding (the web client); with
 * `run_worker_first: ["/api/*"]` only API requests normally reach this code in production.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Env } from "./env.js";
import { errorResponse } from "./lib/errors.js";
import { runScheduled } from "./scheduled.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { sisRoutes } from "./routes/sis.js";
import { exclusionRoutes } from "./routes/exclusions.js";
import { statsRoutes } from "./routes/stats.js";
import { reportRoutes } from "./routes/reports.js";
import { pushRoutes } from "./routes/push.js";
import { healthRoutes } from "./routes/health.js";
import { openapiRoutes } from "./routes/openapi.js";
import { syncRoutes } from "./routes/sync.js";

export const app = new Hono<AppEnv>();

app.onError((error, _c) => {
  console.error("Unhandled error", error);
  return errorResponse(500, "internal", "Unexpected server error");
});

/**
 * Origins the Capacitor shells actually send (see apps/client/capacitor.config.ts): iOS uses
 * Capacitor's default `capacitor://localhost`; Android is configured with `androidScheme:
 * "https"` and no custom hostname, so it defaults to `https://localhost`. `http://localhost` is
 * included defensively for local native-build testing. The web PWA is served same-origin by
 * this same Worker (or proxied in Vite dev), so it never sends a cross-origin `Origin` header
 * and doesn't need to be in this list.
 */
const ALLOWED_CLIENT_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost"];

const api = new Hono<AppEnv>();
api.use(
  "*",
  cors({
    origin: ALLOWED_CLIENT_ORIGINS,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);
api.route("/", healthRoutes);
api.route("/", openapiRoutes);
api.route("/", authRoutes);
api.route("/", userRoutes);
api.route("/", sisRoutes);
api.route("/", syncRoutes);
api.route("/", exclusionRoutes);
api.route("/", statsRoutes);
api.route("/", reportRoutes);
api.route("/", pushRoutes);
app.route("/api/v1", api);

// Anything else: JSON 404 for API paths, static assets (SPA) for the rest when bound.
app.all("*", (c) => {
  const { pathname } = new URL(c.req.url);
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return errorResponse(404, "not_found", "Route not found");
  }
  if (c.env.ASSETS !== undefined) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return errorResponse(404, "not_found", "Route not found");
});

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
