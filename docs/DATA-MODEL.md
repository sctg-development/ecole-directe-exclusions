# Data model (D1)

One D1 (SQLite) database **per school** — never shared. Migrations live in
`apps/server/migrations/` and are applied with `wrangler d1 migrations apply`.

The SQL below is the contract for `0001_init.sql`. Column names are `snake_case` in SQL and
mapped to `camelCase` at the repository layer.

```sql
-- Staff accounts (teachers, vie scolaire, admins). Never hard-deleted.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- UUID v4
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('teacher', 'vie-scolaire', 'admin')),
  password_hash TEXT NOT NULL,               -- base64(PBKDF2-SHA256, 210k iters)
  password_salt TEXT NOT NULL,               -- base64(16 random bytes)
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,               -- ISO 8601 UTC
  updated_at    TEXT NOT NULL
);

-- Rotating refresh tokens, stored hashed.
CREATE TABLE refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,          -- base64(SHA-256(token))
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Login rate limiting.
CREATE TABLE login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL COLLATE NOCASE,
  attempted_at TEXT NOT NULL,
  success      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempted_at);

-- The core record. Student/class names are denormalized on purpose: the SIS is external and
-- mutable; the exclusion record must stay historically accurate (see GDPR.md).
CREATE TABLE exclusions (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL,
  student_name    TEXT NOT NULL,
  class_id        TEXT NOT NULL,
  class_name      TEXT NOT NULL,
  teacher_id      TEXT NOT NULL REFERENCES users(id),
  teacher_name    TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN
                    ('disruption', 'disrespect', 'refusal', 'safety', 'equipment', 'other')),
  comment         TEXT,
  status          TEXT NOT NULL CHECK (status IN
                    ('pending', 'acknowledged', 'arrived', 'missing', 'resolved', 'cancelled')),
  created_at      TEXT NOT NULL,
  acknowledged_at TEXT,
  arrived_at      TEXT,
  missing_at      TEXT,
  resolved_at     TEXT,
  cancelled_at    TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_exclusions_status ON exclusions(status);
CREATE INDEX idx_exclusions_created ON exclusions(created_at);
CREATE INDEX idx_exclusions_student ON exclusions(student_id);
CREATE INDEX idx_exclusions_class ON exclusions(class_id);
CREATE INDEX idx_exclusions_teacher ON exclusions(teacher_id);

-- Immutable audit trail. One row per state change (including creation).
CREATE TABLE exclusion_events (
  id           TEXT PRIMARY KEY,
  exclusion_id TEXT NOT NULL REFERENCES exclusions(id),
  actor_id     TEXT,                          -- NULL for system (cron escalation)
  actor_name   TEXT NOT NULL,                 -- denormalized; 'system' for cron
  type         TEXT NOT NULL CHECK (type IN
                 ('created', 'acknowledged', 'arrived', 'missing', 'resolved', 'cancelled')),
  comment      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_exclusion_events_exclusion ON exclusion_events(exclusion_id);

-- Push notification targets. One row per device/browser.
CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  platform     TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  -- web: push service endpoint URL; android/ios: FCM registration token
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT,                          -- web only (RFC 8291 client public key)
  auth         TEXT,                          -- web only (RFC 8291 auth secret)
  device_name  TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
```

## Retention (GDPR)

- Exclusions and events are school-year data. A documented manual procedure (see
  [GDPR.md](./GDPR.md)) purges records older than the configured retention period
  (`RETENTION_MONTHS`, default 24).
- `login_attempts` rows older than 24 h are pruned opportunistically by the cron handler.
- Student data stored is the strict minimum: SIS identifier and display name at incident time.
