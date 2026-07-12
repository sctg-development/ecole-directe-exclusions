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
 * Vie scolaire live view: active exclusions polled every 15 s, elapsed time ticking every
 * second, one-tap lifecycle actions. Most urgent first: missing, then oldest pending.
 */

import { useEffect, useState } from "react";
import type { Exclusion, ExclusionStatus } from "@exclusions/shared";
import { useActiveExclusions, useTransitionExclusion } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.js";
import { ExclusionCard } from "../components/ExclusionCard.js";
import { EmptyState, ErrorState, Spinner } from "../components/Feedback.js";
import { t } from "../i18n/fr.js";

/** Re-renders every `intervalMs` so elapsed-time displays tick client-side. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const STATUS_PRIORITY: Partial<Record<ExclusionStatus, number>> = {
  missing: 0,
  pending: 1,
  acknowledged: 2,
};

function byUrgency(a: Exclusion, b: Exclusion): number {
  const priority = (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3);
  if (priority !== 0) return priority;
  return a.createdAt.localeCompare(b.createdAt); // Oldest (longest waiting) first.
}

export function Dashboard() {
  const { user } = useAuth();
  const { data, isPending, isError, refetch } = useActiveExclusions();
  const transition = useTransitionExclusion();
  const now = useNow(1000);

  if (user === null) return null;
  if (isPending) return <Spinner />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const exclusions = [...data].sort(byUrgency);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t.dashboard.title}</h1>
      {exclusions.length === 0 ? (
        <EmptyState title={t.dashboard.empty} hint={t.dashboard.emptyHint} />
      ) : (
        <div className="space-y-3">
          {exclusions.map((exclusion) => (
            <ExclusionCard
              key={exclusion.id}
              exclusion={exclusion}
              role={user.role}
              userId={user.id}
              now={now}
              busy={transition.isPending}
              onTransition={(to, comment) =>
                transition.mutate({
                  id: exclusion.id,
                  to,
                  ...(comment !== undefined ? { comment } : {}),
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
