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
import type { Exclusion, ExclusionEvent, User } from "./domain.js";
import { MIN_PASSWORD_LENGTH } from "./constants.js";

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

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ExclusionWithEvents extends Exclusion {
  events: ExclusionEvent[];
}

export interface StatsSummary {
  total: number;
  byStatus: Record<string, number>;
  byReason: Record<string, number>;
  /** Mean delay between creation and arrival, in seconds; null when no arrivals in range. */
  avgArrivalSeconds: number | null;
  /** Share of exclusions that escalated to `missing` at least once (0–1). */
  missingRate: number;
}

export interface ClassStat {
  classId: string;
  className: string;
  count: number;
}

export interface StudentStat {
  studentId: string;
  studentName: string;
  className: string;
  count: number;
}

export interface TimelineBucket {
  /** Bucket start: "2026-07-09" (day), ISO week start date (week) or "2026-07" (month). */
  bucket: string;
  count: number;
}

export interface HealthResponse {
  status: "ok";
  school: { id: string; name: string };
  version: string;
}

export interface VapidPublicKeyResponse {
  publicKey: string;
}
