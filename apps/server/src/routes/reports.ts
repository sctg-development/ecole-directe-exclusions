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
 * CSV report download: UTF-8 with BOM and semicolon separators so French Excel opens it
 * correctly, with French column headers and labels (the audience is French school staff).
 */

import { Hono } from "hono";
import {
  EXCLUSION_REASONS,
  EXCLUSION_STATUS_LABELS_FR,
  statsQuerySchema,
} from "@exclusions/shared";
import type { AppEnv } from "../env.js";
import { parseWith } from "../lib/validate.js";
import { resolveDateRange } from "../lib/dates.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listExclusions } from "../db/exclusions.js";

const CSV_SEPARATOR = ";";
const UTF8_BOM = "\uFEFF";

const CSV_HEADERS = [
  "ID",
  "Élève",
  "Classe",
  "Enseignant",
  "Motif",
  "Commentaire",
  "Statut",
  "Créée le",
  "Prise en compte le",
  "Arrivé(e) le",
  "Manquant(e) le",
  "Clôturée le",
  "Annulée le",
];

function escapeCsvField(value: string): string {
  if (value.includes(CSV_SEPARATOR) || value.includes('"') || /[\r\n]/u.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export const reportRoutes = new Hono<AppEnv>();

// GET /reports/exclusions.csv
reportRoutes.get(
  "/reports/exclusions.csv",
  requireAuth,
  requireRole("vie-scolaire", "admin"),
  async (c) => {
    const parsed = parseWith(statsQuerySchema, c.req.query());
    if (!parsed.ok) return parsed.response;
    const { from, to } = resolveDateRange(parsed.data, new Date());

    // The report is bounded by the retention period (24 months by default), so a single
    // large page is fine at < 10 exclusions/day/school.
    const { items } = await listExclusions(c.env.DB, { from, to }, 1, 100_000);
    const lines = [CSV_HEADERS.join(CSV_SEPARATOR)];
    // Chronological order reads naturally in a spreadsheet.
    for (const exclusion of [...items].reverse()) {
      lines.push(
        [
          exclusion.id,
          exclusion.studentName,
          exclusion.className,
          exclusion.teacherName,
          EXCLUSION_REASONS[exclusion.reason].labelFr,
          exclusion.comment ?? "",
          EXCLUSION_STATUS_LABELS_FR[exclusion.status],
          exclusion.createdAt,
          exclusion.acknowledgedAt ?? "",
          exclusion.arrivedAt ?? "",
          exclusion.missingAt ?? "",
          exclusion.resolvedAt ?? "",
          exclusion.cancelledAt ?? "",
        ]
          .map(escapeCsvField)
          .join(CSV_SEPARATOR),
      );
    }
    return c.body(UTF8_BOM + lines.join("\r\n") + "\r\n", 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="exclusions.csv"',
    });
  },
);
