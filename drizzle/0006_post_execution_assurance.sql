CREATE TABLE IF NOT EXISTS integration_post_execution_reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL,
  expected_count INTEGER NOT NULL,
  changed_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  target_verification TEXT NOT NULL,
  rollback_decision TEXT NOT NULL,
  incident_ticket TEXT,
  evidence_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  executed_by TEXT NOT NULL,
  verified_by TEXT,
  executed_at TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL
);
