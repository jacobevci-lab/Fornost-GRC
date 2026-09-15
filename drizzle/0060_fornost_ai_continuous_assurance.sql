CREATE TABLE IF NOT EXISTS ai_assurance_policies (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, min_accuracy REAL NOT NULL,
 max_error_rate REAL NOT NULL, max_drift_score REAL NOT NULL, max_bias_score REAL NOT NULL,
 max_p95_latency_ms INTEGER NOT NULL, min_sample_size INTEGER NOT NULL, frequency_days INTEGER NOT NULL,
 evidence_plan TEXT NOT NULL, breach_action TEXT NOT NULL, review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_assurance_policy_review_idx ON ai_assurance_policies(status,review_date);
