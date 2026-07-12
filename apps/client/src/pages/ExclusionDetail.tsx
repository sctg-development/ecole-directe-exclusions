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

/** Full exclusion record + immutable events timeline, in French. */

import { useNavigate, useParams } from "react-router";
import type { ReactNode } from "react";
import type { ExclusionEvent } from "@exclusions/shared";
import { EXCLUSION_REASONS, EXCLUSION_STATUS_LABELS_FR } from "@exclusions/shared";
import { ApiError } from "../api/http.js";
import { useExclusion } from "../api/queries.js";
import { ErrorState, Spinner } from "../components/Feedback.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { t } from "../i18n/fr.js";
import { elapsedSecondsSince, formatClock, formatDateTimeFr } from "../lib/format.js";

function eventLabel(event: ExclusionEvent): string {
  if (event.type === "created") return t.detail.eventCreated;
  return EXCLUSION_STATUS_LABELS_FR[event.type];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function ExclusionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useExclusion(id ?? "");

  if (isPending) return <Spinner />;
  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? (
      <ErrorState message={t.detail.notFound} />
    ) : (
      <ErrorState onRetry={() => void refetch()} />
    );
  }

  return (
    <div>
      <button
        type="button"
        className="mb-3 inline-block text-brand-700 dark:text-brand-300"
        onClick={() => void navigate(-1)}
      >
        ← {t.common.back}
      </button>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.detail.title}</h1>
        <StatusBadge status={data.status} />
      </div>

      <dl className="card grid grid-cols-2 gap-4">
        <Field label={t.detail.student}>{data.studentName}</Field>
        <Field label={t.detail.class}>{data.className}</Field>
        <Field label={t.detail.teacher}>{data.teacherName}</Field>
        <Field label={t.detail.reason}>{EXCLUSION_REASONS[data.reason].labelFr}</Field>
        <Field label={t.detail.createdAt}>{formatDateTimeFr(data.createdAt)}</Field>
        {data.arrivedAt !== null ? (
          <Field label={t.detail.arrivalDelay}>
            {formatClock(elapsedSecondsSince(data.createdAt, new Date(data.arrivedAt).getTime()))}
          </Field>
        ) : null}
        {data.comment !== null && data.comment !== "" ? (
          <div className="col-span-2">
            <dt className="text-sm text-neutral-500">{t.detail.comment}</dt>
            <dd className="font-medium">{data.comment}</dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mt-6 mb-3 text-lg font-semibold">{t.detail.timeline}</h2>
      <ol className="card space-y-0 divide-y divide-neutral-200 dark:divide-neutral-800">
        {data.events.map((event) => (
          <li
            key={event.id}
            className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <p className="font-medium">{eventLabel(event)}</p>
              <p className="text-sm text-neutral-500">{event.actorName}</p>
              {event.comment !== null && event.comment !== "" ? (
                <p className="mt-1 text-sm text-neutral-600 italic dark:text-neutral-400">
                  « {event.comment} »
                </p>
              ) : null}
            </div>
            <time className="text-sm whitespace-nowrap text-neutral-500" dateTime={event.createdAt}>
              {formatDateTimeFr(event.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
