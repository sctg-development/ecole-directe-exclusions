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
 * One typed function per endpoint of docs/API.md, all built on the `apiFetch` wrapper.
 * Request/response types come from `@exclusions/shared` — the API source of truth.
 */

import type {
  ChangePasswordRequest,
  ClassStat,
  CreateExclusionRequest,
  CreateUserRequest,
  Exclusion,
  ExclusionStatus,
  ExclusionWithEvents,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  Paginated,
  PushSubscribeRequest,
  PushSubscriptionInfo,
  RefreshResponse,
  ResetPasswordRequest,
  SchoolClass,
  StatsSummary,
  Student,
  StudentStat,
  TimelineBucket,
  TransitionRequest,
  UpdateUserRequest,
  User,
  VapidPublicKeyResponse,
} from "@exclusions/shared";
import { apiFetch } from "./http.js";

// --- Auth ---

export function login(body: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/v1/auth/login", { method: "POST", body, auth: false });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return apiFetch<RefreshResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    auth: false,
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST", body: { refreshToken } });
}

export function me(): Promise<User> {
  return apiFetch<User>("/api/v1/me");
}

export function changePassword(body: ChangePasswordRequest): Promise<void> {
  return apiFetch<void>("/api/v1/me/password", { method: "PATCH", body });
}

// --- Users (admin) ---

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>("/api/v1/users");
}

export function createUser(body: CreateUserRequest): Promise<User> {
  return apiFetch<User>("/api/v1/users", { method: "POST", body });
}

export function updateUser(id: string, body: UpdateUserRequest): Promise<User> {
  return apiFetch<User>(`/api/v1/users/${id}`, { method: "PATCH", body });
}

export function resetUserPassword(id: string, body: ResetPasswordRequest): Promise<void> {
  return apiFetch<void>(`/api/v1/users/${id}/reset-password`, { method: "POST", body });
}

// --- SIS (classes & students) ---

export function listClasses(): Promise<SchoolClass[]> {
  return apiFetch<SchoolClass[]>("/api/v1/classes");
}

export function listStudents(classId: string): Promise<Student[]> {
  return apiFetch<Student[]>(`/api/v1/classes/${classId}/students`);
}

// --- Exclusions ---

export interface ExclusionFilters {
  status?: readonly ExclusionStatus[];
  classId?: string;
  studentId?: string;
  teacherId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function createExclusion(body: CreateExclusionRequest): Promise<Exclusion> {
  return apiFetch<Exclusion>("/api/v1/exclusions", { method: "POST", body });
}

export function listExclusions(filters: ExclusionFilters = {}): Promise<Paginated<Exclusion>> {
  return apiFetch<Paginated<Exclusion>>("/api/v1/exclusions", { query: { ...filters } });
}

export function listActiveExclusions(): Promise<Exclusion[]> {
  return apiFetch<Exclusion[]>("/api/v1/exclusions/active");
}

export function getExclusion(id: string): Promise<ExclusionWithEvents> {
  return apiFetch<ExclusionWithEvents>(`/api/v1/exclusions/${id}`);
}

export function transitionExclusion(id: string, body: TransitionRequest): Promise<Exclusion> {
  return apiFetch<Exclusion>(`/api/v1/exclusions/${id}/transition`, { method: "POST", body });
}

// --- Stats ---

export interface StatsRange {
  from?: string;
  to?: string;
}

export function getStatsSummary(range: StatsRange = {}): Promise<StatsSummary> {
  return apiFetch<StatsSummary>("/api/v1/stats/summary", { query: { ...range } });
}

export function getStatsByClass(range: StatsRange = {}): Promise<ClassStat[]> {
  return apiFetch<ClassStat[]>("/api/v1/stats/by-class", { query: { ...range } });
}

export function getStatsByStudent(range: StatsRange = {}, limit = 20): Promise<StudentStat[]> {
  return apiFetch<StudentStat[]>("/api/v1/stats/by-student", { query: { ...range, limit } });
}

export function getStatsTimeline(
  range: StatsRange = {},
  bucket: "day" | "week" | "month" = "day",
): Promise<TimelineBucket[]> {
  return apiFetch<TimelineBucket[]>("/api/v1/stats/timeline", { query: { ...range, bucket } });
}

// --- Push subscriptions ---

export function subscribePush(body: PushSubscribeRequest): Promise<PushSubscriptionInfo> {
  return apiFetch<PushSubscriptionInfo>("/api/v1/push/subscriptions", { method: "POST", body });
}

export function unsubscribePush(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/push/subscriptions/${id}`, { method: "DELETE" });
}

export function getVapidPublicKey(): Promise<VapidPublicKeyResponse> {
  return apiFetch<VapidPublicKeyResponse>("/api/v1/push/vapid-public-key");
}

// --- Misc ---

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/v1/health", { auth: false });
}
