CREATE TABLE IF NOT EXISTS ai_regulatory_obligations (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  profile_id TEXT,
  framework TEXT NOT NULL,
  obligation_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  owner TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  evidence_plan TEXT NOT NULL,
  recurring_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  action_note TEXT,
  evidence_reference TEXT,
  evidence_sha256 TEXT,
  verification_evidence_reference TEXT,
  verification_evidence_sha256 TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_by TEXT,
  submitted_at TEXT,
  verified_by TEXT,
  verified_at TEXT,
  reopened_by TEXT,
  reopened_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_regulatory_obligation_model_status_idx
  ON ai_regulatory_obligations(model_id,status,priority,due_date);
CREATE UNIQUE INDEX IF NOT EXISTS ai_regulatory_obligation_open_unique_idx
  ON ai_regulatory_obligations(model_id,framework,obligation_code)
  WHERE status!='completed';
