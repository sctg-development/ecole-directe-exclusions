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
 * TanStack Query hooks over the API endpoints. Query keys are centralized in `queryKeys` so
 * mutations can invalidate precisely. The active-exclusions dashboard polls every 15 s.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateExclusionRequest,
  CreateUserRequest,
  Exclusion,
  ResetPasswordRequest,
  TransitionRequest,
  UpdateUserRequest,
} from "@exclusions/shared";
import { ACTIVE_STATUSES } from "@exclusions/shared";
import {
  createExclusion,
  createUser,
  getExclusion,
  getStatsByClass,
  getStatsByStudent,
  getStatsSummary,
  getStatsTimeline,
  listActiveExclusions,
  listClasses,
  listExclusions,
  listStudents,
  listUsers,
  resetUserPassword,
  transitionExclusion,
  updateUser,
} from "./endpoints.js";
import type { ExclusionFilters, StatsRange } from "./endpoints.js";

/** Polling interval of the vie scolaire live dashboard, in milliseconds. */
export const ACTIVE_EXCLUSIONS_POLL_MS = 15_000;

export const queryKeys = {
  classes: ["classes"] as const,
  students: (classId: string) => ["students", classId] as const,
  exclusions: ["exclusions"] as const,
  activeExclusions: ["exclusions", "active"] as const,
  exclusionList: (filters: ExclusionFilters) => ["exclusions", "list", filters] as const,
  exclusion: (id: string) => ["exclusions", "detail", id] as const,
  users: ["users"] as const,
  stats: ["stats"] as const,
  statsSummary: (range: StatsRange) => ["stats", "summary", range] as const,
  statsByClass: (range: StatsRange) => ["stats", "by-class", range] as const,
  statsByStudent: (range: StatsRange, limit: number) =>
    ["stats", "by-student", range, limit] as const,
  statsTimeline: (range: StatsRange, bucket: string) =>
    ["stats", "timeline", range, bucket] as const,
};

// --- SIS ---

export function useClasses() {
  return useQuery({
    queryKey: queryKeys.classes,
    queryFn: listClasses,
    staleTime: 10 * 60 * 1000, // Class lists change rarely.
  });
}

export function useStudents(classId: string | null) {
  return useQuery({
    queryKey: queryKeys.students(classId ?? ""),
    queryFn: () => listStudents(classId ?? ""),
    enabled: classId !== null,
    staleTime: 10 * 60 * 1000,
  });
}

// --- Exclusions ---

export function useActiveExclusions() {
  return useQuery({
    queryKey: queryKeys.activeExclusions,
    queryFn: listActiveExclusions,
    refetchInterval: ACTIVE_EXCLUSIONS_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useExclusions(filters: ExclusionFilters) {
  return useQuery({
    queryKey: queryKeys.exclusionList(filters),
    queryFn: () => listExclusions(filters),
    placeholderData: (previous) => previous, // Keep the list rendered while filters change.
  });
}

export function useExclusion(id: string) {
  return useQuery({
    queryKey: queryKeys.exclusion(id),
    queryFn: () => getExclusion(id),
  });
}

export function useCreateExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExclusionRequest) => createExclusion(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exclusions });
    },
  });
}

export interface TransitionVariables extends TransitionRequest {
  id: string;
}

/**
 * Status transition with an optimistic update of the live dashboard list: the card flips (or
 * disappears when the target status is terminal) immediately, then the poll reconciles.
 */
export function useTransitionExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TransitionVariables) => transitionExclusion(id, body),
    onMutate: async ({ id, to }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activeExclusions });
      const previous = queryClient.getQueryData<Exclusion[]>(queryKeys.activeExclusions);
      if (previous) {
        queryClient.setQueryData<Exclusion[]>(
          queryKeys.activeExclusions,
          previous
            .map((exclusion) => (exclusion.id === id ? { ...exclusion, status: to } : exclusion))
            .filter((exclusion) => ACTIVE_STATUSES.includes(exclusion.status)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.activeExclusions, context.previous);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exclusions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.exclusion(id) });
    },
  });
}

// --- Stats ---

export function useStatsSummary(range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.statsSummary(range),
    queryFn: () => getStatsSummary(range),
  });
}

export function useStatsByClass(range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.statsByClass(range),
    queryFn: () => getStatsByClass(range),
  });
}

export function useStatsByStudent(range: StatsRange, limit = 20) {
  return useQuery({
    queryKey: queryKeys.statsByStudent(range, limit),
    queryFn: () => getStatsByStudent(range, limit),
  });
}

export function useStatsTimeline(range: StatsRange, bucket: "day" | "week" | "month") {
  return useQuery({
    queryKey: queryKeys.statsTimeline(range, bucket),
    queryFn: () => getStatsTimeline(range, bucket),
  });
}

// --- Users (admin) ---

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: listUsers });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserRequest) => createUser(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserRequest & { id: string }) => updateUser(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, ...body }: ResetPasswordRequest & { id: string }) =>
      resetUserPassword(id, body),
  });
}
