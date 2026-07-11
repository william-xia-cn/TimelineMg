CREATE TABLE IF NOT EXISTS sync_mutation_outcomes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  replay_status TEXT NOT NULL,
  outcome_status TEXT NOT NULL,
  reason TEXT,
  task_gate_json TEXT,
  conflict_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (conflict_id) REFERENCES sync_conflicts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_mutation_outcomes_account_mutation ON sync_mutation_outcomes(account_id, mutation_id);
CREATE INDEX IF NOT EXISTS idx_sync_mutation_outcomes_account_status_seen ON sync_mutation_outcomes(account_id, outcome_status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_mutation_outcomes_account_entity ON sync_mutation_outcomes(account_id, entity_type, entity_id);
