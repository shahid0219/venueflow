import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'data', 'venueflow.db');

if (DB_FILE !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'volunteer' CHECK (role IN ('admin','organizer','coordinator','volunteer')),
  phone         TEXT,
  city          TEXT,
  skills        TEXT,
  availability  TEXT,
  bio           TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS venues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  capacity      INTEGER NOT NULL DEFAULT 0,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
  notes         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  description       TEXT,
  venue_id          INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  organiser_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category          TEXT,
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','live','completed','cancelled')),
  expected_attendees INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);

CREATE TABLE IF NOT EXISTS shifts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'general',
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 1,
  location   TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_event ON shifts(event_id);
CREATE INDEX IF NOT EXISTS idx_shifts_window ON shifts(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id   INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','confirmed','declined','completed')),
  created_at TEXT NOT NULL,
  UNIQUE (shift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON shift_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_shift ON shift_assignments(shift_id);

CREATE TABLE IF NOT EXISTS attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id      INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent')),
  checked_in_at TEXT,
  checked_out_at TEXT,
  recorded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (shift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_shift ON attendance(shift_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     INTEGER REFERENCES events(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  due_at       TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

CREATE TABLE IF NOT EXISTS incidents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER REFERENCES events(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL,
  resolution  TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_event ON incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
`);

export const nowIso = () => new Date().toISOString();

/** Total hours between two ISO timestamps, rounded to 2 decimals. */
export function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function dbFile() {
  return DB_FILE;
}
