CREATE TABLE IF NOT EXISTS migration_replacements (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  source_runtime TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'overwrite',
  parent_replacement_id TEXT,
  snapshot_hash TEXT NOT NULL,
  incoming_r2_key TEXT NOT NULL,
  rollback_r2_key TEXT,
  expected_cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  preview_counts_json TEXT NOT NULL DEFAULT '{}',
  result_counts_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  committed_at TEXT,
  rolled_back_at TEXT,
  error_json TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (parent_replacement_id) REFERENCES migration_replacements(id)
);

CREATE INDEX IF NOT EXISTS idx_migration_replacements_account_created
  ON migration_replacements(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_replacements_expiry
  ON migration_replacements(status, expires_at);

CREATE TABLE IF NOT EXISTS account_mutation_locks (
  account_id TEXT PRIMARY KEY,
  replacement_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (replacement_id) REFERENCES migration_replacements(id)
);
