CREATE TABLE IF NOT EXISTS third_party_profiles(
 vendor_id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,service TEXT NOT NULL,legal_entity TEXT NOT NULL,category TEXT NOT NULL,
 criticality TEXT NOT NULL,data_classification TEXT NOT NULL,data_access TEXT NOT NULL,hosting_location TEXT NOT NULL,
 business_owner TEXT NOT NULL,risk_owner TEXT NOT NULL,reviewer TEXT NOT NULL,contact TEXT NOT NULL,
 contract_end TEXT NOT NULL,next_review TEXT NOT NULL,exit_plan TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'onboarding',
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS third_party_profiles_status_review_idx ON third_party_profiles(status,criticality,next_review);

CREATE TABLE IF NOT EXISTS third_party_assessments(
 id TEXT PRIMARY KEY NOT NULL,vendor_id TEXT NOT NULL,cycle_number INTEGER NOT NULL,renewal_of_id TEXT,
 impact INTEGER NOT NULL,likelihood INTEGER NOT NULL,control_maturity INTEGER NOT NULL,questionnaire_json TEXT NOT NULL,
 coverage INTEGER NOT NULL,inherent_score INTEGER NOT NULL,residual_score INTEGER NOT NULL,risk_tier TEXT NOT NULL,
 critical_gaps_json TEXT NOT NULL,treatment_plan TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',
 evidence_reference TEXT,evidence_sha256 TEXT,decision_note TEXT,decision_evidence_reference TEXT,decision_evidence_sha256 TEXT,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 submitted_by TEXT,submitted_at TEXT,decided_by TEXT,decided_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS third_party_assessment_cycle_idx ON third_party_assessments(vendor_id,cycle_number);
CREATE INDEX IF NOT EXISTS third_party_assessment_status_risk_idx ON third_party_assessments(status,risk_tier,updated_at);

CREATE TABLE IF NOT EXISTS third_party_findings(
 id TEXT PRIMARY KEY NOT NULL,assessment_id TEXT NOT NULL,vendor_id TEXT NOT NULL,title TEXT NOT NULL,severity TEXT NOT NULL,
 description TEXT NOT NULL,owner TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',action_note TEXT,
 evidence_reference TEXT,evidence_sha256 TEXT,verification_evidence_reference TEXT,verification_evidence_sha256 TEXT,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 submitted_by TEXT,submitted_at TEXT,verified_by TEXT,verified_at TEXT,reopened_by TEXT,reopened_at TEXT
);
CREATE INDEX IF NOT EXISTS third_party_findings_status_due_idx ON third_party_findings(status,severity,due_date);
CREATE INDEX IF NOT EXISTS third_party_findings_vendor_idx ON third_party_findings(vendor_id,assessment_id);

CREATE TABLE IF NOT EXISTS third_party_events(
 id TEXT PRIMARY KEY NOT NULL,vendor_id TEXT,assessment_id TEXT,finding_id TEXT,action TEXT NOT NULL,
 detail TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS third_party_events_vendor_date_idx ON third_party_events(vendor_id,created_at);
