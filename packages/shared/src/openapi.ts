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
 * Generates an OpenAPI 3.2.0 document for every route under `/api/v1` from the Zod schemas in
 * ./api.ts — the same schemas the server validates requests with. OpenAPI 3.2 reuses the JSON
 * Schema 2020-12 dialect introduced in 3.1, so `target: "draft-2020-12"` (Zod's default) is the
 * correct conversion target; do not use the `"openapi-3.0"` target, which exists only for
 * legacy 3.0.x's nullable workaround.
 *
 * Each named schema below is converted independently rather than through a shared `$ref`
 * registry: composite schemas (e.g. `ExclusionWithEvents`) end up with some inlined duplication
 * of their base shape, which is spec-valid and far simpler than chasing full de-duplication.
 */

import type { z } from "zod";
import type { Role } from "./domain.js";
import { API_VERSION } from "./constants.js";
import {
  apiErrorBodySchema,
  changePasswordRequestSchema,
  classStatSchema,
  createExclusionRequestSchema,
  createUserRequestSchema,
  exclusionSchema,
  exclusionWithEventsSchema,
  healthResponseSchema,
  listExclusionsQuerySchema,
  loginRequestSchema,
  loginResponseSchema,
  paginatedExclusionSchema,
  pushSubscribeRequestSchema,
  pushSubscriptionInfoSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  resetPasswordRequestSchema,
  schoolClassSchema,
  statsByStudentQuerySchema,
  statsQuerySchema,
  statsSummarySchema,
  studentPresenceSchema,
  studentSchema,
  studentStatSchema,
  syncClassesRequestSchema,
  syncPresenceRequestSchema,
  syncPresenceResultSchema,
  syncResultSchema,
  syncStudentsRequestSchema,
  timelineBucketSchema,
  timelineQuerySchema,
  transitionRequestSchema,
  updateUserRequestSchema,
  userSchema,
  vapidPublicKeyResponseSchema,
} from "./api.js";

/** Same derivation the bootstrap route uses (see apps/server/src/routes/auth.ts). */
const bootstrapRequestSchema = createUserRequestSchema.omit({ role: true });

const JSON_SCHEMA_PARAMS = {
  target: "draft-2020-12",
  io: "input",
  unrepresentable: "any",
} as const;

/** Every schema referenced by name from a path below, keyed by its `components.schemas` name. */
const COMPONENT_SCHEMAS: Record<string, z.ZodType> = {
  ApiErrorBody: apiErrorBodySchema,
  BootstrapRequest: bootstrapRequestSchema,
  ChangePasswordRequest: changePasswordRequestSchema,
  ClassStat: classStatSchema,
  CreateExclusionRequest: createExclusionRequestSchema,
  CreateUserRequest: createUserRequestSchema,
  Exclusion: exclusionSchema,
  ExclusionWithEvents: exclusionWithEventsSchema,
  HealthResponse: healthResponseSchema,
  LoginRequest: loginRequestSchema,
  LoginResponse: loginResponseSchema,
  PaginatedExclusion: paginatedExclusionSchema,
  PushSubscribeRequest: pushSubscribeRequestSchema,
  PushSubscriptionInfo: pushSubscriptionInfoSchema,
  RefreshRequest: refreshRequestSchema,
  RefreshResponse: refreshResponseSchema,
  ResetPasswordRequest: resetPasswordRequestSchema,
  SchoolClass: schoolClassSchema,
  StatsSummary: statsSummarySchema,
  Student: studentSchema,
  StudentPresence: studentPresenceSchema,
  StudentStat: studentStatSchema,
  SyncClassesRequest: syncClassesRequestSchema,
  SyncPresenceRequest: syncPresenceRequestSchema,
  SyncPresenceResult: syncPresenceResultSchema,
  SyncResult: syncResultSchema,
  SyncStudentsRequest: syncStudentsRequestSchema,
  TimelineBucket: timelineBucketSchema,
  TransitionRequest: transitionRequestSchema,
  UpdateUserRequest: updateUserRequestSchema,
  User: userSchema,
  VapidPublicKeyResponse: vapidPublicKeyResponseSchema,
};

const TAGS = ["Auth", "Users", "SIS", "Exclusions", "Stats", "Reports", "Push", "Health"] as const;

interface PathParam {
  name: string;
  description: string;
}

type ResponseSpec =
  | { kind: "schema"; status: number; component: string; array?: boolean; description: string }
  | { kind: "empty"; status: number; description: string }
  | { kind: "raw"; status: number; contentType: string; description: string };

interface RouteDescriptor {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tag: (typeof TAGS)[number];
  summary: string;
  auth: "none" | "bearer" | "syncApiKey";
  roles?: Role[];
  note?: string;
  pathParams?: PathParam[];
  querySchema?: z.ZodType;
  requestBody?: string;
  response: ResponseSpec;
}

const ROUTES: RouteDescriptor[] = [
  {
    method: "post",
    path: "/auth/bootstrap",
    tag: "Auth",
    summary: "Bootstrap the first admin account",
    auth: "none",
    note: "Requires the `X-Bootstrap-Secret` header; only succeeds once per deployment.",
    requestBody: "BootstrapRequest",
    response: { kind: "schema", status: 201, component: "User", description: "The new admin." },
  },
  {
    method: "post",
    path: "/auth/login",
    tag: "Auth",
    summary: "Log in with email and password",
    auth: "none",
    requestBody: "LoginRequest",
    response: { kind: "schema", status: 200, component: "LoginResponse", description: "OK" },
  },
  {
    method: "post",
    path: "/auth/refresh",
    tag: "Auth",
    summary: "Rotate a refresh token for a new access/refresh pair",
    auth: "none",
    requestBody: "RefreshRequest",
    response: { kind: "schema", status: 200, component: "RefreshResponse", description: "OK" },
  },
  {
    method: "post",
    path: "/auth/logout",
    tag: "Auth",
    summary: "Revoke a refresh token",
    auth: "bearer",
    requestBody: "RefreshRequest",
    response: { kind: "empty", status: 204, description: "Revoked." },
  },
  {
    method: "get",
    path: "/me",
    tag: "Auth",
    summary: "Get the authenticated caller's profile",
    auth: "bearer",
    response: { kind: "schema", status: 200, component: "User", description: "OK" },
  },
  {
    method: "patch",
    path: "/me/password",
    tag: "Auth",
    summary: "Change the authenticated caller's password",
    auth: "bearer",
    requestBody: "ChangePasswordRequest",
    response: { kind: "empty", status: 204, description: "Changed." },
  },
  {
    method: "get",
    path: "/users",
    tag: "Users",
    summary: "List all users",
    auth: "bearer",
    roles: ["admin"],
    response: { kind: "schema", status: 200, component: "User", array: true, description: "OK" },
  },
  {
    method: "post",
    path: "/users",
    tag: "Users",
    summary: "Create a user",
    auth: "bearer",
    roles: ["admin"],
    requestBody: "CreateUserRequest",
    response: { kind: "schema", status: 201, component: "User", description: "Created." },
  },
  {
    method: "patch",
    path: "/users/{id}",
    tag: "Users",
    summary: "Update a user",
    auth: "bearer",
    roles: ["admin"],
    pathParams: [{ name: "id", description: "User id." }],
    requestBody: "UpdateUserRequest",
    response: { kind: "schema", status: 200, component: "User", description: "Updated." },
  },
  {
    method: "post",
    path: "/users/{id}/reset-password",
    tag: "Users",
    summary: "Reset a user's password",
    auth: "bearer",
    roles: ["admin"],
    pathParams: [{ name: "id", description: "User id." }],
    requestBody: "ResetPasswordRequest",
    response: { kind: "empty", status: 204, description: "Reset." },
  },
  {
    method: "get",
    path: "/classes",
    tag: "SIS",
    summary: "List classes from the school's SIS",
    auth: "bearer",
    response: {
      kind: "schema",
      status: 200,
      component: "SchoolClass",
      array: true,
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/classes/{id}/students",
    tag: "SIS",
    summary: "List students in a class",
    auth: "bearer",
    pathParams: [{ name: "id", description: "Class id." }],
    response: { kind: "schema", status: 200, component: "Student", array: true, description: "OK" },
  },
  {
    method: "get",
    path: "/classes/{id}/presence",
    tag: "SIS",
    summary: "Latest known presence for every student in a class",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    pathParams: [{ name: "id", description: "Class id." }],
    note: "Students with no presence observation yet are omitted from the response.",
    response: {
      kind: "schema",
      status: 200,
      component: "StudentPresence",
      array: true,
      description: "OK",
    },
  },
  {
    method: "put",
    path: "/sync/classes",
    tag: "SIS",
    summary: "Full-replace sync of the class roster from the SIS",
    auth: "syncApiKey",
    note: "Machine-to-machine: call before /sync/students. Classes absent from the payload are deleted.",
    requestBody: "SyncClassesRequest",
    response: { kind: "schema", status: 200, component: "SyncResult", description: "OK" },
  },
  {
    method: "put",
    path: "/sync/students",
    tag: "SIS",
    summary: "Full-replace sync of the student roster from the SIS",
    auth: "syncApiKey",
    note: "Machine-to-machine: call after /sync/classes. Students absent from the payload are deleted.",
    requestBody: "SyncStudentsRequest",
    response: { kind: "schema", status: 200, component: "SyncResult", description: "OK" },
  },
  {
    method: "post",
    path: "/sync/presence",
    tag: "SIS",
    summary: "Append student presence observations",
    auth: "syncApiKey",
    note: "Machine-to-machine, append-only. Pruned automatically after PRESENCE_RETENTION_DAYS.",
    requestBody: "SyncPresenceRequest",
    response: {
      kind: "schema",
      status: 201,
      component: "SyncPresenceResult",
      description: "Appended.",
    },
  },
  {
    method: "post",
    path: "/exclusions",
    tag: "Exclusions",
    summary: "Report a new exclusion",
    auth: "bearer",
    requestBody: "CreateExclusionRequest",
    response: { kind: "schema", status: 201, component: "Exclusion", description: "Created." },
  },
  {
    method: "get",
    path: "/exclusions",
    tag: "Exclusions",
    summary: "List exclusions, filtered and paginated",
    auth: "bearer",
    querySchema: listExclusionsQuerySchema,
    response: {
      kind: "schema",
      status: 200,
      component: "PaginatedExclusion",
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/exclusions/active",
    tag: "Exclusions",
    summary: "List currently active exclusions",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    response: {
      kind: "schema",
      status: 200,
      component: "Exclusion",
      array: true,
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/exclusions/{id}",
    tag: "Exclusions",
    summary: "Get an exclusion with its full audit trail",
    auth: "bearer",
    pathParams: [{ name: "id", description: "Exclusion id." }],
    response: {
      kind: "schema",
      status: 200,
      component: "ExclusionWithEvents",
      description: "OK",
    },
  },
  {
    method: "post",
    path: "/exclusions/{id}/transition",
    tag: "Exclusions",
    summary: "Transition an exclusion's lifecycle status",
    auth: "bearer",
    pathParams: [{ name: "id", description: "Exclusion id." }],
    requestBody: "TransitionRequest",
    response: { kind: "schema", status: 200, component: "Exclusion", description: "Updated." },
  },
  {
    method: "get",
    path: "/stats/summary",
    tag: "Stats",
    summary: "Aggregate exclusion totals for a date range",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    querySchema: statsQuerySchema,
    response: { kind: "schema", status: 200, component: "StatsSummary", description: "OK" },
  },
  {
    method: "get",
    path: "/stats/by-class",
    tag: "Stats",
    summary: "Exclusion counts per class for a date range",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    querySchema: statsQuerySchema,
    response: {
      kind: "schema",
      status: 200,
      component: "ClassStat",
      array: true,
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/stats/by-student",
    tag: "Stats",
    summary: "Exclusion counts per student for a date range",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    querySchema: statsByStudentQuerySchema,
    response: {
      kind: "schema",
      status: 200,
      component: "StudentStat",
      array: true,
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/stats/timeline",
    tag: "Stats",
    summary: "Time-bucketed exclusion counts for a date range",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    querySchema: timelineQuerySchema,
    response: {
      kind: "schema",
      status: 200,
      component: "TimelineBucket",
      array: true,
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/reports/exclusions.csv",
    tag: "Reports",
    summary: "Export exclusions for a date range as CSV",
    auth: "bearer",
    roles: ["vie-scolaire", "admin"],
    querySchema: statsQuerySchema,
    response: { kind: "raw", status: 200, contentType: "text/csv", description: "CSV export." },
  },
  {
    method: "post",
    path: "/push/subscriptions",
    tag: "Push",
    summary: "Register a push subscription for the authenticated caller",
    auth: "bearer",
    requestBody: "PushSubscribeRequest",
    response: {
      kind: "schema",
      status: 201,
      component: "PushSubscriptionInfo",
      description: "Registered.",
    },
  },
  {
    method: "delete",
    path: "/push/subscriptions/{id}",
    tag: "Push",
    summary: "Remove a push subscription",
    auth: "bearer",
    pathParams: [{ name: "id", description: "Push subscription id." }],
    response: { kind: "empty", status: 204, description: "Removed." },
  },
  {
    method: "get",
    path: "/push/vapid-public-key",
    tag: "Push",
    summary: "Get the VAPID public key for Web Push subscription setup",
    auth: "bearer",
    response: {
      kind: "schema",
      status: 200,
      component: "VapidPublicKeyResponse",
      description: "OK",
    },
  },
  {
    method: "get",
    path: "/health",
    tag: "Health",
    summary: "Unauthenticated health check",
    auth: "none",
    response: { kind: "schema", status: 200, component: "HealthResponse", description: "OK" },
  },
];

function componentRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function buildResponseObject(response: ResponseSpec): Record<string, unknown> {
  if (response.kind === "empty") {
    return { description: response.description };
  }
  if (response.kind === "raw") {
    return {
      description: response.description,
      content: { [response.contentType]: { schema: { type: "string" } } },
    };
  }
  const schema =
    response.array === true
      ? { type: "array", items: componentRef(response.component) }
      : componentRef(response.component);
  return { description: response.description, content: { "application/json": { schema } } };
}

function describeRoute(route: RouteDescriptor): string | undefined {
  const parts: string[] = [];
  if (route.roles !== undefined) parts.push(`Requires role: ${route.roles.join(" or ")}.`);
  if (route.note !== undefined) parts.push(route.note);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Builds the full OpenAPI 3.2.0 document for a running deployment. */
export function buildOpenApiDocument(opts: {
  serverUrl: string;
  schoolId: string;
  schoolName: string;
}): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(COMPONENT_SCHEMAS)) {
    schemas[name] = schema.toJSONSchema(JSON_SCHEMA_PARAMS);
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of ROUTES) {
    const parameters: unknown[] = (route.pathParams ?? []).map((param) => ({
      name: param.name,
      in: "path",
      required: true,
      description: param.description,
      schema: { type: "string" },
    }));

    if (route.querySchema !== undefined) {
      const queryJson = route.querySchema.toJSONSchema(JSON_SCHEMA_PARAMS) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const required = new Set(queryJson.required ?? []);
      for (const [name, schema] of Object.entries(queryJson.properties ?? {})) {
        parameters.push({ name, in: "query", required: required.has(name), schema });
      }
    }

    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      ...(describeRoute(route) !== undefined ? { description: describeRoute(route) } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(route.requestBody !== undefined
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: componentRef(route.requestBody) } },
            },
          }
        : {}),
      responses: {
        [String(route.response.status)]: buildResponseObject(route.response),
        default: {
          description: "Error",
          content: { "application/json": { schema: componentRef("ApiErrorBody") } },
        },
      },
      ...(route.auth === "bearer" ? { security: [{ bearerAuth: [] }] } : {}),
      ...(route.auth === "syncApiKey" ? { security: [{ syncApiKeyAuth: [] }] } : {}),
    };

    const pathItem = (paths[route.path] ??= {});
    pathItem[route.method] = operation;
  }

  return {
    openapi: "3.2.0",
    info: {
      title: "Exclusions API",
      version: API_VERSION,
      description: `Classroom exclusion tracking API for ${opts.schoolName} (${opts.schoolId}).`,
    },
    servers: [{ url: opts.serverUrl }],
    tags: TAGS.map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        syncApiKeyAuth: { type: "apiKey", in: "header", name: "X-Sync-Api-Key" },
      },
      schemas,
    },
  };
}
