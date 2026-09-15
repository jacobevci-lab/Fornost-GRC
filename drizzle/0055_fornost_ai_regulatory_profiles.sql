CREATE TABLE IF NOT EXISTS ai_regulatory_profiles (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, classification TEXT NOT NULL, jurisdictions TEXT NOT NULL,
 provider_role INTEGER NOT NULL DEFAULT 0, deployer_role INTEGER NOT NULL DEFAULT 0, importer_role INTEGER NOT NULL DEFAULT 0,
 distributor_role INTEGER NOT NULL DEFAULT 0, personal_data INTEGER NOT NULL DEFAULT 0, automated_decision INTEGER NOT NULL DEFAULT 0,
 public_interaction INTEGER NOT NULL DEFAULT 0, high_impact INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL,
 legal_reviewer TEXT NOT NULL, classification_rationale TEXT NOT NULL, transparency_notice TEXT NOT NULL,
 human_oversight TEXT NOT NULL, obligations_json TEXT NOT NULL, completed_keys_json TEXT NOT NULL, gaps_json TEXT NOT NULL,
 review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_regulatory_status_review_idx ON ai_regulatory_profiles(status,review_date);
