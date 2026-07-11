CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  mutation_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  local_json TEXT,
  cloud_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_account_status_created ON sync_conflicts(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_account_entity ON sync_conflicts(account_id, entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_conflicts_account_mutation ON sync_conflicts(account_id, mutation_id);
