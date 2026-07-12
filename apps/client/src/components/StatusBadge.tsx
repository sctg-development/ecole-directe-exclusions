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

import type { ExclusionStatus } from "@exclusions/shared";
import { EXCLUSION_STATUS_LABELS_FR } from "@exclusions/shared";

/** Status color semantics: pending amber, acknowledged blue, missing red (see Dashboard). */
const STATUS_CLASSES: Record<ExclusionStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  acknowledged: "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100",
  arrived: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  missing: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300",
  resolved: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  cancelled: "bg-neutral-200 text-neutral-500 line-through dark:bg-neutral-800",
};

export function StatusBadge({ status }: { status: ExclusionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_CLASSES[status]}`}
    >
      {EXCLUSION_STATUS_LABELS_FR[status]}
    </span>
  );
}
