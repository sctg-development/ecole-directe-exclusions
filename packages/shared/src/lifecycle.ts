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

import type { ExclusionEventType, ExclusionStatus, Role } from "./domain.js";

/**
 * The exclusion lifecycle state machine — single source of truth for both the server
 * (transition endpoint, cron escalation) and the clients (which buttons to show).
 * See the diagram in docs/ARCHITECTURE.md.
 */
export const EXCLUSION_TRANSITIONS: Record<ExclusionStatus, readonly ExclusionStatus[]> = {
  pending: ["acknowledged", "arrived", "missing", "cancelled"],
  acknowledged: ["arrived", "missing", "cancelled"],
  missing: ["arrived", "resolved"],
  arrived: ["resolved"],
  resolved: [],
  cancelled: [],
};

/** The cron escalation acts as this pseudo-role. */
export type Actor = Role | "system";

const TRANSITION_ROLES: Record<Exclude<ExclusionStatus, "pending">, readonly Actor[]> = {
  acknowledged: ["vie-scolaire", "admin"],
  arrived: ["vie-scolaire", "admin"],
  missing: ["system", "vie-scolaire", "admin"],
  resolved: ["vie-scolaire", "admin"],
  // Teachers may only cancel exclusions they created themselves (checked separately).
  cancelled: ["teacher", "vie-scolaire", "admin"],
};

export function isTransitionAllowed(from: ExclusionStatus, to: ExclusionStatus): boolean {
  return EXCLUSION_TRANSITIONS[from].includes(to);
}

/**
 * Full permission check for a state change.
 *
 * @param isCreator whether the actor is the teacher who created the exclusion — only relevant
 *                  for `teacher` actors cancelling their own exclusion.
 */
export function canTransition(
  from: ExclusionStatus,
  to: ExclusionStatus,
  actor: Actor,
  isCreator = false,
): boolean {
  if (!isTransitionAllowed(from, to)) return false;
  if (to === "pending") return false;
  const allowed = TRANSITION_ROLES[to];
  if (!allowed.includes(actor)) return false;
  if (to === "cancelled" && actor === "teacher" && !isCreator) return false;
  return true;
}

/** Maps a transition target to the audit-trail event type it records. */
export function eventTypeForTransition(to: ExclusionStatus): ExclusionEventType {
  // Statuses and event types share names for everything but creation.
  return to as ExclusionEventType;
}

/** Terminal statuses: no further transitions. */
export function isTerminal(status: ExclusionStatus): boolean {
  return EXCLUSION_TRANSITIONS[status].length === 0;
}
