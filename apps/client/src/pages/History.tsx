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
 * Filterable exclusion history. Teachers only ever receive their own records — the API
 * enforces that server-side; this page just renders whatever the list endpoint returns.
 */

import { useState } from "react";
import { Link } from "react-router";
import type { ExclusionStatus } from "@exclusions/shared";
import { EXCLUSION_REASONS, EXCLUSION_STATUS_LABELS_FR } from "@exclusions/shared";
import type { ExclusionFilters } from "../api/endpoints.js";
import { useClasses, useExclusions } from "../api/queries.js";
import { EmptyState, ErrorState, Spinner } from "../components/Feedback.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { t, tf } from "../i18n/fr.js";
import { compareClasses, formatDateTimeFr } from "../lib/format.js";

const ALL_STATUSES = Object.keys(EXCLUSION_STATUS_LABELS_FR) as ExclusionStatus[];
const PAGE_SIZE = 25;

export function History() {
  const [statuses, setStatuses] = useState<ExclusionStatus[]>([]);
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const classesQuery = useClasses();

  const filters: ExclusionFilters = {
    page,
    pageSize: PAGE_SIZE,
    ...(statuses.length > 0 ? { status: statuses } : {}),
    ...(classId !== "" ? { classId } : {}),
    ...(from !== "" ? { from } : {}),
    ...(to !== "" ? { to } : {}),
  };
  const { data, isPending, isError, refetch } = useExclusions(filters);

  const toggleStatus = (status: ExclusionStatus) => {
    setPage(1);
    setStatuses((current) =>
      current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status],
    );
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t.history.title}</h1>

      {/* Status multi-chips */}
      <fieldset className="mb-3">
        <legend className="mb-1 text-sm font-medium text-neutral-500">
          {t.history.statusFilter}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statuses.includes(status)}
              className={`chip ${statuses.includes(status) ? "chip-active" : ""}`}
              onClick={() => toggleStatus(status)}
            >
              {EXCLUSION_STATUS_LABELS_FR[status]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Class + date range */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">
            {t.history.classFilter}
          </span>
          <select
            className="input"
            value={classId}
            onChange={(event) => {
              setPage(1);
              setClassId(event.target.value);
            }}
          >
            <option value="">{t.history.allClasses}</option>
            {(classesQuery.data ? [...classesQuery.data].sort(compareClasses) : []).map(
              (schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.history.from}</span>
          <input
            className="input"
            type="date"
            value={from}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.history.to}</span>
          <input
            className="input"
            type="date"
            value={to}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
          />
        </label>
      </div>

      {isPending ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t.history.empty} />
      ) : (
        <>
          <p className="mb-2 text-sm text-neutral-500">
            {tf(t.history.results, { count: data.total })}
          </p>
          <ul className="space-y-2">
            {data.items.map((exclusion) => (
              <li key={exclusion.id}>
                <Link
                  to={`/exclusions/${exclusion.id}`}
                  className="card flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {exclusion.studentName}{" "}
                      <span className="font-normal text-neutral-500">— {exclusion.className}</span>
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {formatDateTimeFr(exclusion.createdAt)} · {exclusion.teacherName} ·{" "}
                      {EXCLUSION_REASONS[exclusion.reason].labelFr}
                    </p>
                  </div>
                  <StatusBadge status={exclusion.status} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t.common.previousPage}
            </button>
            <span className="text-sm text-neutral-500">
              {tf(t.common.pageOf, { page, pages: totalPages })}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t.common.nextPage}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
