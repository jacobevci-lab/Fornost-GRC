CREATE TABLE IF NOT EXISTS ai_model_changes (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_type TEXT NOT NULL, from_version TEXT NOT NULL,
 to_version TEXT NOT NULL, summary TEXT NOT NULL, risk_impact TEXT NOT NULL, rollback_plan TEXT NOT NULL,
 test_evidence TEXT NOT NULL DEFAULT '', planned_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 decision_note TEXT, approved_by TEXT, approved_at TEXT, deployed_by TEXT, deployed_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_model_changes_model_status_idx ON ai_model_changes(model_id,status,planned_date);
CREATE TABLE IF NOT EXISTS ai_model_monitoring (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, accuracy REAL NOT NULL, error_rate REAL NOT NULL,
 drift_score REAL NOT NULL, bias_score REAL NOT NULL, p95_latency_ms INTEGER NOT NULL,
 sample_size INTEGER NOT NULL, health TEXT NOT NULL, alerts_json TEXT NOT NULL DEFAULT '[]',
 note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_model_monitoring_model_created_idx ON ai_model_monitoring(model_id,recorded_at);
