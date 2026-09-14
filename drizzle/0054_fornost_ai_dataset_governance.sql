CREATE TABLE IF NOT EXISTS ai_datasets (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL, purpose TEXT NOT NULL,
 source_type TEXT NOT NULL, source_owner TEXT NOT NULL, provenance TEXT NOT NULL, license TEXT NOT NULL,
 legal_basis TEXT NOT NULL, data_classification TEXT NOT NULL, personal_data INTEGER NOT NULL DEFAULT 0,
 special_category INTEGER NOT NULL DEFAULT 0, consent_required INTEGER NOT NULL DEFAULT 0,
 consent_verified INTEGER NOT NULL DEFAULT 0, retention_days INTEGER NOT NULL, records INTEGER NOT NULL,
 quality_score INTEGER NOT NULL, bias_score INTEGER NOT NULL, documentation TEXT NOT NULL, review_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', blockers_json TEXT NOT NULL DEFAULT '[]', decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, UNIQUE(model_id,name,version)
);
CREATE INDEX IF NOT EXISTS ai_dataset_model_review_idx ON ai_datasets(model_id,status,review_date);
