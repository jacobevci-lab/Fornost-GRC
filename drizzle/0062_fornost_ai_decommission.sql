CREATE TABLE IF NOT EXISTS ai_decommission_plans (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, replacement_model_id TEXT, reason TEXT NOT NULL,
 owner TEXT NOT NULL, planned_at TEXT NOT NULL, dependencies TEXT NOT NULL, stakeholder_plan TEXT NOT NULL,
 rollback_plan TEXT NOT NULL, data_disposition TEXT NOT NULL, retention_basis TEXT NOT NULL,
 disposal_method TEXT NOT NULL, artifact_plan TEXT NOT NULL, access_plan TEXT NOT NULL, evidence_plan TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, execution_evidence_ref TEXT,
 execution_evidence_sha256 TEXT, verification_evidence_ref TEXT, verification_evidence_sha256 TEXT,
 verification_checks_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 executed_by TEXT, executed_at TEXT, verified_by TEXT, verified_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_decommission_status_date_idx ON ai_decommission_plans(status,planned_at);
