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
 * Stats for the vie scolaire / admins, defaulting to the current school year.
 * Chart color policy (validated, see src/styles.css): one hue for counts
 * (`--chart-count`), red reserved for the "missing" metric (`--chart-missing`).
 */

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  useStatsByClass,
  useStatsByStudent,
  useStatsSummary,
  useStatsTimeline,
} from "../api/queries.js";
import { EmptyState, ErrorState, Spinner } from "../components/Feedback.js";
import { t } from "../i18n/fr.js";
import { bucketLabel, formatClock, schoolYearRange } from "../lib/format.js";

type Bucket = "day" | "week" | "month";

const BUCKETS: readonly { value: Bucket; label: string }[] = [
  { value: "day", label: t.stats.bucketDay },
  { value: "week", label: t.stats.bucketWeek },
  { value: "month", label: t.stats.bucketMonth },
];

const percentFr = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

const AXIS_TICK = { fill: "var(--chart-muted)", fontSize: 12 } as const;

/** French single-metric tooltip shared by both bar charts. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-900">
      <p className="font-medium">{label}</p>
      <p className="text-neutral-600 dark:text-neutral-400">
        {t.stats.count} : <span className="font-semibold tabular-nums">{payload[0]?.value}</span>
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent ? "text-red-700 dark:text-red-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function Stats() {
  const defaultRange = schoolYearRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [bucket, setBucket] = useState<Bucket>("month");

  const range = { from, to };
  const summary = useStatsSummary(range);
  const timeline = useStatsTimeline(range, bucket);
  const byClass = useStatsByClass(range);
  const byStudent = useStatsByStudent(range, 20);

  if (summary.isPending) return <Spinner />;
  if (summary.isError) return <ErrorState onRetry={() => void summary.refetch()} />;

  const { total, byStatus, avgArrivalSeconds, missingRate } = summary.data;
  // Approximation from current statuses: resolved incidents have gone through arrival or a
  // closed search; the dedicated escalation share is `missingRate` next to it.
  const arrivedCount = (byStatus["arrived"] ?? 0) + (byStatus["resolved"] ?? 0);
  const arrivedRate = total > 0 ? arrivedCount / total : 0;

  const timelineData = (timeline.data ?? []).map((entry) => ({
    label: bucketLabel(entry.bucket, bucket),
    count: entry.count,
  }));
  const classData = (byClass.data ?? []).slice(0, 15);
  const studentData = byStudent.data ?? [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t.stats.title}</h1>

      {/* Date range (defaults to the current school year) */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.stats.from}</span>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.stats.to}</span>
          <input
            className="input"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t.stats.total} value={String(total)} />
        <StatTile label={t.stats.arrivedRate} value={percentFr.format(arrivedRate)} />
        <StatTile
          label={t.stats.avgArrival}
          value={avgArrivalSeconds === null ? "—" : formatClock(avgArrivalSeconds)}
        />
        <StatTile label={t.stats.missingRate} value={percentFr.format(missingRate)} accent />
      </div>

      {total === 0 ? (
        <EmptyState title={t.stats.noData} />
      ) : (
        <>
          {/* Timeline */}
          <section className="card mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t.stats.timelineTitle}</h2>
              <div className="flex gap-1" role="group" aria-label={t.stats.timelineTitle}>
                {BUCKETS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={bucket === entry.value}
                    className={`chip ${bucket === entry.value ? "chip-active" : ""}`}
                    onClick={() => setBucket(entry.value)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
            {timeline.isPending ? (
              <Spinner />
            ) : (
              <div className="overflow-x-auto">
                <div className="h-64" style={{ minWidth: Math.max(320, timelineData.length * 36) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={timelineData}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <YAxis
                        allowDecimals={false}
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-count)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          {/* By class — horizontal bars, top 15 */}
          <section className="card mb-6">
            <h2 className="mb-3 text-lg font-semibold">{t.stats.byClassTitle}</h2>
            {byClass.isPending ? (
              <Spinner />
            ) : classData.length === 0 ? (
              <EmptyState title={t.stats.noData} />
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 320, height: Math.max(160, classData.length * 32 + 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={classData}
                      layout="vertical"
                      margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="className"
                        width={96}
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-count)"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={20}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          {/* By student — table, top 20 */}
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">{t.stats.byStudentTitle}</h2>
            {byStudent.isPending ? (
              <Spinner />
            ) : studentData.length === 0 ? (
              <EmptyState title={t.stats.noData} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
                      <th className="py-2 pr-2 font-medium">{t.stats.rank}</th>
                      <th className="py-2 pr-2 font-medium">{t.stats.student}</th>
                      <th className="py-2 pr-2 font-medium">{t.stats.class}</th>
                      <th className="py-2 text-right font-medium">{t.stats.count}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentData.map((entry, index) => (
                      <tr
                        key={entry.studentId}
                        className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                      >
                        <td className="py-2 pr-2 text-neutral-500 tabular-nums">{index + 1}</td>
                        <td className="py-2 pr-2 font-medium">{entry.studentName}</td>
                        <td className="py-2 pr-2">{entry.className}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {entry.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
