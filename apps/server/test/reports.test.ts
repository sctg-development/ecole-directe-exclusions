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

/** CSV report shape: UTF-8 BOM, semicolon separators, French headers, one row per exclusion. */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Exclusion } from "@exclusions/shared";
import { insertExclusionStmt } from "../src/db/exclusions.js";
import { api, bootstrapAndLogin, createAndLoginUser } from "./helpers.js";

let vieScolaireToken: string;
let teacherToken: string;

beforeAll(async () => {
  const admin = await bootstrapAndLogin({ email: "csv-admin@example.org" });
  const vieScolaire = await createAndLoginUser(admin.accessToken, {
    email: "csv-vs@example.org",
    displayName: "CSV VS",
    role: "vie-scolaire",
  });
  vieScolaireToken = vieScolaire.accessToken;
  const teacher = await createAndLoginUser(admin.accessToken, {
    email: "csv-teacher@example.org",
    displayName: "CSV Teacher",
    role: "teacher",
  });
  teacherToken = teacher.accessToken;

  const row: Exclusion = {
    id: "csv-fx-1",
    studentId: "stu-csv",
    studentName: "Élève Accentué",
    classId: "cls-csv",
    className: "1re G1",
    teacherId: teacher.user.id,
    teacherName: teacher.user.displayName,
    reason: "other",
    comment: 'Contient un point-virgule ; et des guillemets "cités"',
    status: "resolved",
    createdAt: "2026-02-01T08:00:00.000Z",
    acknowledgedAt: "2026-02-01T08:01:00.000Z",
    arrivedAt: "2026-02-01T08:05:00.000Z",
    missingAt: null,
    resolvedAt: "2026-02-01T08:10:00.000Z",
    cancelledAt: null,
    updatedAt: "2026-02-01T08:10:00.000Z",
  };
  await env.DB.batch([insertExclusionStmt(env.DB, row)]);
});

describe("GET /api/v1/reports/exclusions.csv", () => {
  it("forbids a teacher (403)", async () => {
    const response = await api.get(
      "/api/v1/reports/exclusions.csv?from=2026-02-01&to=2026-02-28",
      teacherToken,
    );
    expect(response.status).toBe(403);
  });

  it("returns a UTF-8 BOM, semicolon-separated CSV with French headers", async () => {
    const response = await api.get(
      "/api/v1/reports/exclusions.csv?from=2026-02-01&to=2026-02-28",
      vieScolaireToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("exclusions.csv");

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM: EF BB BF.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const text = new TextDecoder("utf-8").decode(bytes);
    const withoutBom = text.replace(/^\uFEFF/u, "");
    const lines = withoutBom.split("\r\n").filter((line) => line.length > 0);

    expect(lines[0]).toBe(
      [
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
      ].join(";"),
    );

    expect(lines).toHaveLength(2); // header + one seeded row within range
    const dataLine = lines[1] ?? "";
    expect(dataLine).toContain("csv-fx-1");
    expect(dataLine).toContain("Élève Accentué");
    expect(dataLine).toContain("1re G1");
    expect(dataLine).toContain("Autre motif"); // French label for reason "other"
    expect(dataLine).toContain("Clôturée"); // French label for status "resolved"
    // The comment contains a semicolon and quotes, so it must be quoted and escaped.
    expect(dataLine).toContain('"Contient un point-virgule ; et des guillemets ""cités"""');
  });

  it("is empty (header only) outside the seeded date range", async () => {
    const response = await api.get(
      "/api/v1/reports/exclusions.csv?from=2020-01-01&to=2020-01-31",
      vieScolaireToken,
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text
      .replace(/^\uFEFF/u, "")
      .split("\r\n")
      .filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
  });
});
