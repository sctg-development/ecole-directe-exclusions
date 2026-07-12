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

import { SCHOOL_YEAR_START_MONTH } from "@exclusions/shared";
import type { SchoolClass } from "@exclusions/shared";

export interface DateRange {
  /** Inclusive ISO date, e.g. "2025-08-01". */
  from: string;
  /** Inclusive ISO date, e.g. "2026-07-31". */
  to: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats a duration in seconds as "mm:ss" (or "h:mm:ss" above one hour).
 * Negative values clamp to "00:00".
 */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Whole seconds elapsed between an ISO timestamp and `now` (epoch ms), clamped to >= 0. */
export function elapsedSecondsSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** "09/07/2026 10:32" — French short date + time. */
export function formatDateTimeFr(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });

/** Axis label for a stats timeline bucket ("2026-07-09", ISO week start, or "2026-07"). */
export function bucketLabel(bucket: string, unit: "day" | "week" | "month"): string {
  if (unit === "month") {
    const [year, month] = bucket.split("-");
    if (!year || !month) return bucket;
    return monthFormatter.format(new Date(Number(year), Number(month) - 1, 1));
  }
  const [, month, day] = bucket.split("-");
  if (!month || !day) return bucket;
  return `${day}/${month}`;
}

/** Calendar year and month (1-12) of `now` as observed in Europe/Paris — matches the server's
 * `parisYearMonth` (apps/server/src/lib/dates.ts) so both sides agree on where the school year
 * starts, regardless of the device's own timezone. */
function parisYearMonth(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  return { year, month };
}

/**
 * The French school year containing `now`: 1 August → 31 July, Europe/Paris.
 * Default range for stats and reports.
 */
export function schoolYearRange(now: Date = new Date()): DateRange {
  const { year, month } = parisYearMonth(now);
  const startYear = month >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
  return {
    from: `${startYear}-${pad2(SCHOOL_YEAR_START_MONTH)}-01`,
    to: `${startYear + 1}-${pad2(SCHOOL_YEAR_START_MONTH - 1)}-31`,
  };
}

/** Lowercases and strips diacritics for accent-insensitive client-side search. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const LEVEL_ORDER = [
  "Sixième",
  "Cinquième",
  "Quatrième",
  "Troisième",
  "Seconde",
  "Première",
  "Terminale",
];

function levelRank(level: string): number {
  const index = LEVEL_ORDER.indexOf(level);
  return index === -1 ? LEVEL_ORDER.length : index;
}

/** Sorts classes by school level (Sixième → Terminale), then by name, numeric-aware. */
export function compareClasses(a: SchoolClass, b: SchoolClass): number {
  const rankDiff = levelRank(a.level) - levelRank(b.level);
  if (rankDiff !== 0) return rankDiff;
  if (a.level !== b.level) return a.level.localeCompare(b.level, "fr");
  return a.name.localeCompare(b.name, "fr", { numeric: true });
}
