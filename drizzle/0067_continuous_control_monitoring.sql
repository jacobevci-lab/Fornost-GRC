ALTER TABLE evidence_automation_rules ADD COLUMN freshness_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE evidence_automation_rules ADD COLUMN failure_threshold INTEGER NOT NULL DEFAULT 1;
ALTER TABLE evidence_automation_rules ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence_automation_rules ADD COLUMN auto_finding INTEGER NOT NULL DEFAULT 1;
ALTER TABLE evidence_automation_rules ADD COLUMN remediation_owner TEXT NOT NULL DEFAULT '';
ALTER TABLE evidence_automation_rules ADD COLUMN remediation_due_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE evidence_automation_rules ADD COLUMN next_run_at TEXT;
ALTER TABLE evidence_automation_rules ADD COLUMN last_evidence_at TEXT;
CREATE INDEX IF NOT EXISTS evidence_automation_rules_due_idx ON evidence_automation_rules(enabled,next_run_at);

ALTER TABLE evidence_automation_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE evidence_automation_runs ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence_automation_runs ADD COLUMN error_code TEXT;
CREATE INDEX IF NOT EXISTS evidence_automation_runs_rule_created_idx ON evidence_automation_runs(rule_id,created_at);

CREATE TABLE IF NOT EXISTS evidence_automation_findings(
 id TEXT PRIMARY KEY NOT NULL, rule_id TEXT NOT NULL, evidence_id TEXT,
 title TEXT NOT NULL, severity TEXT NOT NULL, owner TEXT NOT NULL, due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', detail TEXT NOT NULL, occurrence_count INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, acknowledged_by TEXT, acknowledged_at TEXT,
 closure_note TEXT, closure_evidence_ref TEXT, closure_evidence_sha256 TEXT, closed_by TEXT, closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_automation_findings_open_idx ON evidence_automation_findings(rule_id) WHERE status!='closed';
CREATE INDEX IF NOT EXISTS evidence_automation_findings_status_due_idx ON evidence_automation_findings(status,due_date);
