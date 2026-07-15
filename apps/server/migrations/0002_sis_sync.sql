-- Migration 0002: SIS-synced roster + presence log. Contract: docs/DATA-MODEL.md.
--
-- Fed by a future external sync worker pushing data from the school's SIS (École Directe /
-- APLIM Charlemagne) via the machine-to-machine /api/v1/sync/* endpoints. Unlike `exclusions`,
-- these rows are not denormalized snapshots: `classes`/`students` are a full replace-on-sync
-- mirror of the SIS roster, and `student_presence_events` is an append-only log pruned by the
-- cron handler (see docs/GDPR.md).

-- Classes synced from the SIS. Replaces mock/APLIM live lookups once SIS_PROVIDER = 'synced'.
CREATE TABLE classes (
  id            TEXT PRIMARY KEY,   -- SIS class id
  name          TEXT NOT NULL,
  level         TEXT NOT NULL,
  student_count INTEGER NOT NULL,
  synced_at     TEXT NOT NULL       -- ISO 8601 UTC, last sync write
);

-- Students synced from the SIS. class_name is denormalized (not joined) to match the shared
-- Student type exactly, same convention as `exclusions.student_name`/`class_name`.
CREATE TABLE students (
  id          TEXT PRIMARY KEY,     -- SIS student id
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  class_id    TEXT NOT NULL REFERENCES classes(id),
  class_name  TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);
CREATE INDEX idx_students_class ON students(class_id);

-- Append-only presence observations pushed by the sync worker. Pruned automatically by the
-- cron handler after PRESENCE_RETENTION_DAYS — a materially more sensitive category (student
-- whereabouts over time) than anything else stored, hence the short, automatic retention.
CREATE TABLE student_presence_events (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  present     INTEGER NOT NULL,     -- 0/1
  observed_at TEXT NOT NULL,        -- as reported by the source system
  recorded_at TEXT NOT NULL         -- when this Worker stored it
);
CREATE INDEX idx_presence_student_time ON student_presence_events(student_id, observed_at DESC);
CREATE INDEX idx_presence_observed_at ON student_presence_events(observed_at);
