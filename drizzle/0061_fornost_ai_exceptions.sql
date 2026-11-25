CREATE TABLE IF NOT EXISTS ai_exceptions (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, parent_id TEXT, exception_type TEXT NOT NULL,
 reference TEXT NOT NULL, title TEXT NOT NULL, justification TEXT NOT NULL, scope TEXT NOT NULL,
 compensating_controls TEXT NOT NULL, owner TEXT NOT NULL, risk_tier TEXT NOT NULL,
 expires_at TEXT NOT NULL, review_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_exceptions_model_status_idx ON ai_exceptions(model_id,status,expires_at,review_at);
CREATE INDEX IF NOT EXISTS ai_exceptions_review_idx ON ai_exceptions(status,review_at,expires_at);
