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

import type { ExclusionReason, ExclusionStatus, Role } from "./domain.js";

/** Server version, exposed via `GET /health` and the generated OpenAPI document. */
export const API_VERSION = "0.1.0";

/**
 * Exclusion reasons with their French UI labels. The UI is French-first (users are French
 * school staff); labels live here because the server also uses them in push notifications.
 */
export const EXCLUSION_REASONS: Record<ExclusionReason, { labelFr: string }> = {
  disruption: { labelFr: "Perturbation du cours" },
  disrespect: { labelFr: "Manque de respect" },
  refusal: { labelFr: "Refus de travail" },
  safety: { labelFr: "Mise en danger" },
  equipment: { labelFr: "Matériel ou tenue non conforme" },
  other: { labelFr: "Autre motif" },
};

export const EXCLUSION_STATUS_LABELS_FR: Record<ExclusionStatus, string> = {
  pending: "En attente",
  acknowledged: "Prise en compte",
  arrived: "Élève arrivé",
  missing: "Élève manquant",
  resolved: "Clôturée",
  cancelled: "Annulée",
};

export const ROLE_LABELS_FR: Record<Role, string> = {
  teacher: "Enseignant",
  "vie-scolaire": "Vie scolaire",
  admin: "Administrateur",
};

/** Statuses shown on the vie scolaire live dashboard. */
export const ACTIVE_STATUSES: readonly ExclusionStatus[] = [
  "pending",
  "acknowledged",
  "missing",
] as const;

/** Minutes before a pending/acknowledged exclusion escalates to `missing` (per-school var). */
export const DEFAULT_ESCALATION_MINUTES = 10;

/** Days to retain synced `student_presence_events` rows before the cron handler prunes them. */
export const DEFAULT_PRESENCE_RETENTION_DAYS = 30;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 14;
export const PBKDF2_ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 10;

/** Login rate limiting: max attempts per e-mail within the window. */
export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MINUTES = 5;

/** French school year starts on 1 August (Europe/Paris). Used as default stats range. */
export const SCHOOL_YEAR_START_MONTH = 8;
