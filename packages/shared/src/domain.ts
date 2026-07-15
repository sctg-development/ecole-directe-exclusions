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
 * Core domain types shared between the server and every client.
 * These mirror the D1 schema (see docs/DATA-MODEL.md) in camelCase.
 */

export type Role = "teacher" | "vie-scolaire" | "admin";

export type ExclusionStatus =
  "pending" | "acknowledged" | "arrived" | "missing" | "resolved" | "cancelled";

export type ExclusionReason =
  "disruption" | "disrespect" | "refusal" | "safety" | "equipment" | "other";

export type ExclusionEventType =
  "created" | "acknowledged" | "arrived" | "missing" | "resolved" | "cancelled";

export type PushPlatform = "web" | "android" | "ios";

/** A staff account (teacher, vie scolaire supervisor or admin). */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

/** A class as reported by the SIS provider (mock today, APLIM later). */
export interface SchoolClass {
  id: string;
  name: string;
  /** French lycée level, e.g. "Seconde", "Première", "Terminale". */
  level: string;
  studentCount: number;
}

/** A student as reported by the SIS provider. */
export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
}

/**
 * An exclusion incident. Student, class and teacher display names are denormalized at creation
 * time so history survives SIS changes (see docs/DATA-MODEL.md).
 */
export interface Exclusion {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  reason: ExclusionReason;
  comment: string | null;
  status: ExclusionStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  arrivedAt: string | null;
  missingAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

/** One immutable audit-trail entry per state change (including creation). */
export interface ExclusionEvent {
  id: string;
  exclusionId: string;
  /** `null` when the system (cron escalation) acted. */
  actorId: string | null;
  actorName: string;
  type: ExclusionEventType;
  comment: string | null;
  createdAt: string;
}

/** A registered push target (browser subscription or FCM device token). */
export interface PushSubscriptionInfo {
  id: string;
  platform: PushPlatform;
  deviceName: string | null;
  createdAt: string;
}

/** A student's most recent presence observation, as reported by the synced SIS. */
export interface StudentPresence {
  studentId: string;
  studentName: string;
  present: boolean;
  observedAt: string;
}
