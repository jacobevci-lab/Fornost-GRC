CREATE TABLE IF NOT EXISTS ai_risks (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, incident_id TEXT, change_id TEXT,
 category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, cause TEXT NOT NULL,
 consequence TEXT NOT NULL, owner TEXT NOT NULL, likelihood INTEGER NOT NULL, impact INTEGER NOT NULL,
 control_effectiveness INTEGER NOT NULL, inherent_score INTEGER NOT NULL, residual_score INTEGER NOT NULL,
 risk_tier TEXT NOT NULL, treatment TEXT NOT NULL, treatment_plan TEXT NOT NULL,
 treatment_owner TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 acceptance_expiry TEXT, decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_risks_model_status_idx ON ai_risks(model_id,status,risk_tier,due_date);
