CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  picture_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  legacy_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  icon_char TEXT,
  subject TEXT,
  subject_in_matrixview TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  plan_id TEXT,
  legacy_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  plan_id TEXT,
  legacy_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  plan_id TEXT,
  bucket_id TEXT,
  legacy_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  description TEXT,
  checklist_json TEXT NOT NULL DEFAULT '[]',
  labels_json TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  arranged_date TEXT,
  due_date TEXT,
  schedule_time TEXT,
  duration INTEGER DEFAULT 45,
  subject TEXT,
  recurrence_series_id TEXT,
  recurrence_index INTEGER,
  recurrence_count INTEGER,
  recurrence_frequency TEXT,
  recurrence_anchor_start_date TEXT,
  recurrence_anchor_due_date TEXT,
  priority TEXT DEFAULT 'medium',
  progress TEXT DEFAULT 'not_started',
  completed_at TEXT,
  source TEXT,
  source_type TEXT,
  source_uid TEXT,
  source_url TEXT,
  source_updated_at TEXT,
  managebac_subject TEXT,
  readonly INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (bucket_id) REFERENCES buckets(id)
);

CREATE TABLE IF NOT EXISTS containers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  legacy_id TEXT,
  name TEXT NOT NULL,
  time_start TEXT,
  time_end TEXT,
  repeat TEXT,
  days_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  active_start_date TEXT,
  active_end_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  container_id TEXT,
  legacy_id TEXT,
  title TEXT NOT NULL,
  date TEXT,
  time_start TEXT,
  time_end TEXT,
  source TEXT,
  source_uid TEXT,
  subject_in_matrixview TEXT,
  active_start_date TEXT,
  active_end_date TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(account_id, legacy_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (container_id) REFERENCES containers(id)
);

CREATE TABLE IF NOT EXISTS product_settings (
  account_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, key),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  source_runtime TEXT NOT NULL,
  source_database_id TEXT,
  snapshot_hash TEXT NOT NULL,
  snapshot_r2_key TEXT,
  status TEXT NOT NULL,
  counts_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, source_runtime, snapshot_hash),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS migration_conflicts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  migration_run_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT NOT NULL,
  local_json TEXT,
  cloud_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (migration_run_id) REFERENCES migration_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON account_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_account_updated ON tasks(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_events_account_date ON calendar_events(account_id, date);
CREATE INDEX IF NOT EXISTS idx_migration_runs_account ON migration_runs(account_id, created_at);
