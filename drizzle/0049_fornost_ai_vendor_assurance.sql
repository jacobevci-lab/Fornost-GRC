CREATE TABLE IF NOT EXISTS ai_vendor_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, risk_id TEXT, service_name TEXT NOT NULL,
 legal_entity TEXT NOT NULL, service_owner TEXT NOT NULL, data_locations TEXT NOT NULL,
 subprocessors TEXT NOT NULL, certifications TEXT NOT NULL, sla TEXT NOT NULL, exit_plan TEXT NOT NULL,
 contract_end TEXT NOT NULL, review_date TEXT NOT NULL, breach_hours INTEGER NOT NULL,
 dpa INTEGER NOT NULL, training_opt_out INTEGER NOT NULL, deletion_commitment INTEGER NOT NULL,
 audit_rights INTEGER NOT NULL, security_exhibit INTEGER NOT NULL, bcdr INTEGER NOT NULL,
 subprocessor_notice INTEGER NOT NULL, data_portability INTEGER NOT NULL, assurance_score INTEGER NOT NULL,
 assurance_tier TEXT NOT NULL, gaps TEXT NOT NULL, critical_gaps TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_vendor_model_status_idx ON ai_vendor_assessments(model_id,status,review_date);
