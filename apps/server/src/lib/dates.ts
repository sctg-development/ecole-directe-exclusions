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
 * Date-range helpers for stats and reports. The default range is the current French school
 * year: 1 August (Europe/Paris) to 31 July of the following year. The Paris-local boundary is
 * computed in TypeScript (not in SQLite, which has no timezone tables).
 */

import { SCHOOL_YEAR_START_MONTH } from "@exclusions/shared";

/** Calendar year and month (1-12) of `now` as observed in Europe/Paris. */
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
 * Inclusive UTC ISO range of the school year containing `now`.
 * 1 August 00:00 Europe/Paris is 31 July 22:00 UTC — EU DST (UTC+2) always applies on 1 August.
 */
export function schoolYearRange(now: Date): { from: string; to: string } {
  const { year, month } = parisYearMonth(now);
  const startYear = month >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
  return {
    from: `${startYear}-07-31T22:00:00.000Z`,
    to: `${startYear + 1}-07-31T21:59:59.999Z`,
  };
}

/** Expands a date-only `from` bound to the start of that UTC day. */
export function normalizeFromDate(value: string): string {
  return value.length === 10 ? `${value}T00:00:00.000Z` : new Date(value).toISOString();
}

/** Expands a date-only `to` bound to the end of that UTC day (the bound is inclusive). */
export function normalizeToDate(value: string): string {
  return value.length === 10 ? `${value}T23:59:59.999Z` : new Date(value).toISOString();
}

/** Resolves an optional `?from=&to=` query to a concrete inclusive UTC range. */
export function resolveDateRange(
  query: { from?: string | undefined; to?: string | undefined },
  now: Date,
): { from: string; to: string } {
  const fallback = schoolYearRange(now);
  return {
    from: query.from !== undefined ? normalizeFromDate(query.from) : fallback.from,
    to: query.to !== undefined ? normalizeToDate(query.to) : fallback.to,
  };
}
