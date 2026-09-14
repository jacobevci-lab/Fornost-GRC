CREATE TABLE IF NOT EXISTS ai_access_assignments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, principal_type TEXT NOT NULL, principal TEXT NOT NULL,
 display_name TEXT NOT NULL, access_level TEXT NOT NULL, data_scope TEXT NOT NULL, purpose TEXT NOT NULL,
 owner TEXT NOT NULL, mfa INTEGER NOT NULL, conditional_access INTEGER NOT NULL, jit INTEGER NOT NULL,
 managed_identity INTEGER NOT NULL, key_rotation_days INTEGER NOT NULL, risk_score INTEGER NOT NULL,
 risk_tier TEXT NOT NULL, last_used TEXT NOT NULL, expires_at TEXT NOT NULL, review_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', review_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, certified_by TEXT, certified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_access_model_principal_idx ON ai_access_assignments(model_id,principal);
CREATE INDEX IF NOT EXISTS ai_access_review_idx ON ai_access_assignments(status,review_date,expires_at);
