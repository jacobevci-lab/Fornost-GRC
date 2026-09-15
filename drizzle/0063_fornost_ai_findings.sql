CREATE TABLE IF NOT EXISTS ai_findings (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, domain TEXT NOT NULL, source_ref TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL, root_cause TEXT NOT NULL, corrective_action TEXT NOT NULL,
 preventive_action TEXT NOT NULL, owner TEXT NOT NULL, severity TEXT NOT NULL, due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', action_note TEXT, evidence_reference TEXT, evidence_sha256 TEXT,
 verification_evidence_reference TEXT, verification_evidence_sha256 TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 submitted_by TEXT, submitted_at TEXT, verified_by TEXT, verified_at TEXT, reopened_by TEXT, reopened_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_findings_model_status_idx ON ai_findings(model_id,status,severity,due_date);
CREATE UNIQUE INDEX IF NOT EXISTS ai_findings_source_open_idx ON ai_findings(model_id,domain,source_ref) WHERE status!='resolved';
