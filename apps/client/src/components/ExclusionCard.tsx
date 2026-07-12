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
 * One live-dashboard card. Action buttons are derived from the shared lifecycle state machine
 * (`canTransition`) so the UI can never offer a move the server would reject.
 */

import { useState } from "react";
import { Link } from "react-router";
import type { Exclusion, ExclusionStatus, Role } from "@exclusions/shared";
import { EXCLUSION_REASONS, canTransition } from "@exclusions/shared";
import { t } from "../i18n/fr.js";
import { elapsedSecondsSince, formatClock } from "../lib/format.js";
import { PromptDialog } from "./PromptDialog.js";
import { StatusBadge } from "./StatusBadge.js";

/** Ordered action candidates; `canTransition` filters them per status/role. */
const ACTION_TARGETS: readonly ExclusionStatus[] = [
  "acknowledged",
  "arrived",
  "missing",
  "resolved",
  "cancelled",
];

const ACTION_CLASSES: Record<ExclusionStatus, string> = {
  pending: "", // Never a target.
  acknowledged: "btn-primary",
  arrived: "bg-emerald-600 text-white hover:bg-emerald-700",
  missing: "btn-danger",
  resolved: "btn-secondary",
  cancelled: "btn-ghost",
};

/** Card accent by status: pending amber, acknowledged blue, missing red. */
const CARD_ACCENTS: Partial<Record<ExclusionStatus, string>> = {
  pending: "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40",
  acknowledged: "border-brand-400 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30",
  missing: "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40",
};

export interface ExclusionCardProps {
  exclusion: Exclusion;
  /** Role of the signed-in user, deciding which lifecycle actions are offered. */
  role: Role;
  /** Id of the signed-in user (teachers may only cancel their own exclusions). */
  userId?: string;
  /** Current epoch ms, ticking every second in the dashboard for the elapsed timer. */
  now: number;
  onTransition?: (to: ExclusionStatus, comment?: string) => void;
  /** Disables the action buttons while a transition request is in flight. */
  busy?: boolean;
}

/** A short free-text note makes sense when closing or cancelling; other actions are single-tap. */
function commentPromptMessage(to: ExclusionStatus): string | null {
  return to === "resolved"
    ? t.actions.commentPromptResolve
    : to === "cancelled"
      ? t.actions.commentPromptCancel
      : null;
}

export function ExclusionCard({
  exclusion,
  role,
  userId,
  now,
  onTransition,
  busy = false,
}: ExclusionCardProps) {
  const isCreator = userId !== undefined && exclusion.teacherId === userId;
  const targets = ACTION_TARGETS.filter((to) =>
    canTransition(exclusion.status, to, role, isCreator),
  );
  const [pendingComment, setPendingComment] = useState<{
    to: ExclusionStatus;
    message: string;
  } | null>(null);

  const handleAction = (to: ExclusionStatus) => {
    const message = commentPromptMessage(to);
    if (message === null) {
      onTransition?.(to);
      return;
    }
    setPendingComment({ to, message });
  };

  return (
    <article
      className={`card border ${CARD_ACCENTS[exclusion.status] ?? "border-neutral-200 dark:border-neutral-800"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">
            {exclusion.studentName}{" "}
            <span className="font-medium text-neutral-500">— {exclusion.className}</span>
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t.dashboard.reportedBy} {exclusion.teacherName} ·{" "}
            {EXCLUSION_REASONS[exclusion.reason].labelFr}
          </p>
          {exclusion.comment ? (
            <p className="mt-1 text-sm text-neutral-600 italic dark:text-neutral-400">
              « {exclusion.comment} »
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={exclusion.status} />
          <p
            className="font-mono text-lg font-semibold tabular-nums"
            aria-label={t.dashboard.elapsedLabel}
            title={t.dashboard.elapsedTitle}
          >
            {formatClock(elapsedSecondsSince(exclusion.createdAt, now))}
          </p>
        </div>
      </div>
      {targets.length > 0 && onTransition ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {targets.map((to) => (
            <button
              key={to}
              type="button"
              className={`btn ${ACTION_CLASSES[to]}`}
              disabled={busy}
              onClick={() => handleAction(to)}
            >
              {t.actions[to as Exclude<ExclusionStatus, "pending">]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-right">
        <Link
          to={`/exclusions/${exclusion.id}`}
          className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
        >
          {t.dashboard.detail}
        </Link>
      </div>
      {pendingComment !== null ? (
        <PromptDialog
          message={pendingComment.message}
          onCancel={() => setPendingComment(null)}
          onConfirm={(value) => {
            const comment = value.trim();
            onTransition?.(pendingComment.to, comment === "" ? undefined : comment);
            setPendingComment(null);
          }}
        />
      ) : null}
    </article>
  );
}
