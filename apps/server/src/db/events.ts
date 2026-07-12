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

/** Repository for the immutable `exclusion_events` audit table. */

import type { ExclusionEvent, ExclusionEventType } from "@exclusions/shared";

interface ExclusionEventRow {
  id: string;
  exclusion_id: string;
  actor_id: string | null;
  actor_name: string;
  type: string;
  comment: string | null;
  created_at: string;
}

function mapEvent(row: ExclusionEventRow): ExclusionEvent {
  return {
    id: row.id,
    exclusionId: row.exclusion_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    type: row.type as ExclusionEventType,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

/** Prepared INSERT — returned unexecuted so callers can batch it with the state change. */
export function insertEventStmt(db: D1Database, event: ExclusionEvent): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO exclusion_events (id, exclusion_id, actor_id, actor_name, type, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.exclusionId,
      event.actorId,
      event.actorName,
      event.type,
      event.comment,
      event.createdAt,
    );
}

export async function listEventsForExclusion(
  db: D1Database,
  exclusionId: string,
): Promise<ExclusionEvent[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM exclusion_events WHERE exclusion_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(exclusionId)
    .all<ExclusionEventRow>();
  return rows.results.map(mapEvent);
}
