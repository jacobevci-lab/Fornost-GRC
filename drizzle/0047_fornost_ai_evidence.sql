CREATE TABLE IF NOT EXISTS ai_evidence (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, control_id TEXT, change_id TEXT, incident_id TEXT,
 evidence_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, source TEXT NOT NULL,
 collection_method TEXT NOT NULL, classification TEXT NOT NULL, owner TEXT NOT NULL,
 expected_sha256 TEXT NOT NULL, integrity_status TEXT NOT NULL DEFAULT 'pending', verified_at TEXT,
 collected_at TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, decision_note TEXT
);
CREATE INDEX IF NOT EXISTS ai_evidence_model_status_idx ON ai_evidence(model_id,status,valid_until);
