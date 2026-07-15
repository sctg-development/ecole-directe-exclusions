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

import { z } from "zod";
import type {
  Exclusion,
  ExclusionEvent,
  ExclusionEventType,
  PushSubscriptionInfo,
  SchoolClass,
  Student,
  StudentPresence,
  User,
} from "./domain.js";
import { MIN_PASSWORD_LENGTH } from "./constants.js";

/**
 * Compile-time check that `A` and `B` are exactly the same type (not just assignable one way).
 * Used below to keep each response schema in exact sync with the domain/API interface it
 * mirrors for OpenAPI generation — a mismatch fails `tsc --noEmit` instead of the generated
 * document silently drifting from reality.
 */
type AssertExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : never;
function assertExact<A, B>(_check: AssertExact<A, B>): void {}

/**
 * Zod schemas for every API request body and query string — the machine-readable half of
 * docs/API.md. The server validates with these; clients infer their request types from them.
 */

export const roleSchema = z.enum(["teacher", "vie-scolaire", "admin"]);

export const exclusionStatusSchema = z.enum([
  "pending",
  "acknowledged",
  "arrived",
  "missing",
  "resolved",
  "cancelled",
]);

export const exclusionReasonSchema = z.enum([
  "disruption",
  "disrespect",
  "refusal",
  "safety",
  "equipment",
  "other",
]);

export const pushPlatformSchema = z.enum(["web", "android", "ios"]);

const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(128);
/** ISO date ("2026-07-09") or datetime ("2026-07-09T08:30:00Z"). */
const isoDateOrDateTime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

// --- Auth ---

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// --- Users (admin) ---

export const createUserRequestSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(120),
  role: roleSchema,
  password: passwordSchema,
});

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: roleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty update" });

export const resetPasswordRequestSchema = z.object({
  password: passwordSchema,
});

// --- Exclusions ---

export const createExclusionRequestSchema = z
  .object({
    studentId: z.string().min(1),
    classId: z.string().min(1),
    reason: exclusionReasonSchema,
    comment: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.reason !== "other" || (body.comment?.length ?? 0) > 0, {
    message: "comment is required when reason is 'other'",
    path: ["comment"],
  });

export const transitionRequestSchema = z.object({
  to: exclusionStatusSchema,
  comment: z.string().trim().max(500).optional(),
});

export const listExclusionsQuerySchema = z.object({
  status: z
    .union([exclusionStatusSchema, z.array(exclusionStatusSchema)])
    .optional()
    .transform((value) => (value === undefined || Array.isArray(value) ? value : [value])),
  classId: z.string().optional(),
  studentId: z.string().optional(),
  teacherId: z.string().optional(),
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// --- Stats & reports ---

export const statsQuerySchema = z.object({
  from: isoDateOrDateTime.optional(),
  to: isoDateOrDateTime.optional(),
});

export const statsByStudentQuerySchema = statsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const timelineQuerySchema = statsQuerySchema.extend({
  bucket: z.enum(["day", "week", "month"]).default("day"),
});

// --- Push subscriptions ---

export const webPushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const pushSubscribeRequestSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("web"),
    subscription: webPushSubscriptionSchema,
    deviceName: z.string().trim().max(120).optional(),
  }),
  z.object({
    platform: z.enum(["android", "ios"]),
    token: z.string().min(1),
    deviceName: z.string().trim().max(120).optional(),
  }),
]);

// --- Inferred request types ---

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type CreateExclusionRequest = z.infer<typeof createExclusionRequestSchema>;
export type TransitionRequest = z.infer<typeof transitionRequestSchema>;
export type ListExclusionsQuery = z.infer<typeof listExclusionsQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
export type PushSubscribeRequest = z.infer<typeof pushSubscribeRequestSchema>;

// --- Response shapes ---

export interface ApiErrorBody {
  error: {
    code:
      | "invalid_credentials"
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "validation_error"
      | "invalid_transition"
      | "rate_limited"
      | "conflict"
      | "internal";
    message: string;
  };
}

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum([
      "invalid_credentials",
      "unauthorized",
      "forbidden",
      "not_found",
      "validation_error",
      "invalid_transition",
      "rate_limited",
      "conflict",
      "internal",
    ]),
    message: z.string(),
  }),
});
assertExact<z.infer<typeof apiErrorBodySchema>, ApiErrorBody>(true);

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// --- Domain mirrors (runtime schemas for the response types above, used by the OpenAPI
// generator; the domain interfaces in ./domain.ts remain the source of truth). ---

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  displayName: z.string(),
  role: roleSchema,
  disabled: z.boolean(),
  createdAt: z.string(),
});
assertExact<z.infer<typeof userSchema>, User>(true);

export const schoolClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.string(),
  studentCount: z.number(),
});
assertExact<z.infer<typeof schoolClassSchema>, SchoolClass>(true);

export const studentSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  classId: z.string(),
  className: z.string(),
});
assertExact<z.infer<typeof studentSchema>, Student>(true);

export const exclusionEventTypeSchema = z.enum([
  "created",
  "acknowledged",
  "arrived",
  "missing",
  "resolved",
  "cancelled",
]);
assertExact<z.infer<typeof exclusionEventTypeSchema>, ExclusionEventType>(true);

export const exclusionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  classId: z.string(),
  className: z.string(),
  teacherId: z.string(),
  teacherName: z.string(),
  reason: exclusionReasonSchema,
  comment: z.string().nullable(),
  status: exclusionStatusSchema,
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  missingAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  updatedAt: z.string(),
});
assertExact<z.infer<typeof exclusionSchema>, Exclusion>(true);

export const exclusionEventSchema = z.object({
  id: z.string(),
  exclusionId: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  type: exclusionEventTypeSchema,
  comment: z.string().nullable(),
  createdAt: z.string(),
});
assertExact<z.infer<typeof exclusionEventSchema>, ExclusionEvent>(true);

export const pushSubscriptionInfoSchema = z.object({
  id: z.string(),
  platform: pushPlatformSchema,
  deviceName: z.string().nullable(),
  createdAt: z.string(),
});
assertExact<z.infer<typeof pushSubscriptionInfoSchema>, PushSubscriptionInfo>(true);

export const studentPresenceSchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  present: z.boolean(),
  observedAt: z.string(),
});
assertExact<z.infer<typeof studentPresenceSchema>, StudentPresence>(true);

/** Concrete pagination wrapper for `Exclusion` — the only `Paginated<T>` usage in the API. */
export const paginatedExclusionSchema = z.object({
  items: z.array(exclusionSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});
assertExact<z.infer<typeof paginatedExclusionSchema>, Paginated<Exclusion>>(true);

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});
assertExact<z.infer<typeof loginResponseSchema>, LoginResponse>(true);

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
assertExact<z.infer<typeof refreshResponseSchema>, RefreshResponse>(true);

export interface ExclusionWithEvents extends Exclusion {
  events: ExclusionEvent[];
}

export const exclusionWithEventsSchema = exclusionSchema.extend({
  events: z.array(exclusionEventSchema),
});
assertExact<z.infer<typeof exclusionWithEventsSchema>, ExclusionWithEvents>(true);

export interface StatsSummary {
  total: number;
  byStatus: Record<string, number>;
  byReason: Record<string, number>;
  /** Mean delay between creation and arrival, in seconds; null when no arrivals in range. */
  avgArrivalSeconds: number | null;
  /** Share of exclusions that escalated to `missing` at least once (0–1). */
  missingRate: number;
}

export const statsSummarySchema = z.object({
  total: z.number(),
  byStatus: z.record(z.string(), z.number()),
  byReason: z.record(z.string(), z.number()),
  avgArrivalSeconds: z.number().nullable(),
  missingRate: z.number(),
});
assertExact<z.infer<typeof statsSummarySchema>, StatsSummary>(true);

export interface ClassStat {
  classId: string;
  className: string;
  count: number;
}

export const classStatSchema = z.object({
  classId: z.string(),
  className: z.string(),
  count: z.number(),
});
assertExact<z.infer<typeof classStatSchema>, ClassStat>(true);

export interface StudentStat {
  studentId: string;
  studentName: string;
  className: string;
  count: number;
}

export const studentStatSchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  className: z.string(),
  count: z.number(),
});
assertExact<z.infer<typeof studentStatSchema>, StudentStat>(true);

export interface TimelineBucket {
  /** Bucket start: "2026-07-09" (day), ISO week start date (week) or "2026-07" (month). */
  bucket: string;
  count: number;
}

export const timelineBucketSchema = z.object({
  bucket: z.string(),
  count: z.number(),
});
assertExact<z.infer<typeof timelineBucketSchema>, TimelineBucket>(true);

export interface HealthResponse {
  status: "ok";
  school: { id: string; name: string };
  version: string;
}

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  school: z.object({ id: z.string(), name: z.string() }),
  version: z.string(),
});
assertExact<z.infer<typeof healthResponseSchema>, HealthResponse>(true);

export interface VapidPublicKeyResponse {
  publicKey: string;
}

export const vapidPublicKeyResponseSchema = z.object({
  publicKey: z.string(),
});
assertExact<z.infer<typeof vapidPublicKeyResponseSchema>, VapidPublicKeyResponse>(true);

// --- SIS sync (machine-to-machine, see docs/API.md "SIS sync") ---

/** Full-replace sync: rows not present in the payload are deleted from the mirror. */
export const syncClassesRequestSchema = z.object({
  classes: z.array(schoolClassSchema).min(1),
});
export type SyncClassesRequest = z.infer<typeof syncClassesRequestSchema>;

export const syncStudentsRequestSchema = z.object({
  students: z.array(studentSchema).min(1),
});
export type SyncStudentsRequest = z.infer<typeof syncStudentsRequestSchema>;

export const syncPresenceRequestSchema = z.object({
  observations: z
    .array(
      z.object({
        studentId: z.string().min(1),
        present: z.boolean(),
        observedAt: isoDateOrDateTime,
      }),
    )
    .min(1),
});
export type SyncPresenceRequest = z.infer<typeof syncPresenceRequestSchema>;

export const syncResultSchema = z.object({
  upserted: z.number(),
  deleted: z.number(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

export const syncPresenceResultSchema = z.object({
  inserted: z.number(),
});
export type SyncPresenceResult = z.infer<typeof syncPresenceResultSchema>;
