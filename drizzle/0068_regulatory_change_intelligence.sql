CREATE TABLE IF NOT EXISTS regulatory_intelligence_sources(
 id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,authority TEXT NOT NULL,jurisdiction TEXT NOT NULL,
 source_type TEXT NOT NULL,url TEXT NOT NULL,owner TEXT NOT NULL,review_frequency_days INTEGER NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,last_checked_at TEXT,next_check_at TEXT NOT NULL,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_sources_url_idx ON regulatory_intelligence_sources(url);
CREATE INDEX IF NOT EXISTS regulatory_sources_due_idx ON regulatory_intelligence_sources(enabled,next_check_at);

CREATE TABLE IF NOT EXISTS regulatory_changes(
 id TEXT PRIMARY KEY NOT NULL,source_id TEXT NOT NULL,external_ref TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,
 published_date TEXT NOT NULL,effective_date TEXT NOT NULL,severity TEXT NOT NULL,change_type TEXT NOT NULL,
 applicability TEXT NOT NULL DEFAULT 'undetermined',status TEXT NOT NULL DEFAULT 'triage',owner TEXT NOT NULL,reviewer TEXT NOT NULL,
 applicability_rationale TEXT,content_sha256 TEXT NOT NULL,detected_by TEXT NOT NULL,detected_at TEXT NOT NULL,
 updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,closed_by TEXT,closed_at TEXT,closure_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_changes_source_ref_idx ON regulatory_changes(source_id,external_ref);
CREATE INDEX IF NOT EXISTS regulatory_changes_status_effective_idx ON regulatory_changes(status,severity,effective_date);

CREATE TABLE IF NOT EXISTS regulatory_change_impacts(
 id TEXT PRIMARY KEY NOT NULL,change_id TEXT NOT NULL,target_type TEXT NOT NULL,target_ref TEXT NOT NULL,target_title TEXT NOT NULL,
 impact_level TEXT NOT NULL,required_action TEXT NOT NULL,action_owner TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',
 action_note TEXT,evidence_reference TEXT,evidence_sha256 TEXT,verification_evidence_reference TEXT,verification_evidence_sha256 TEXT,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,
 submitted_by TEXT,submitted_at TEXT,verified_by TEXT,verified_at TEXT,reopened_by TEXT,reopened_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_impacts_target_idx ON regulatory_change_impacts(change_id,target_type,target_ref);
CREATE INDEX IF NOT EXISTS regulatory_impacts_status_due_idx ON regulatory_change_impacts(status,impact_level,due_date);

CREATE TABLE IF NOT EXISTS regulatory_change_events(
 id TEXT PRIMARY KEY NOT NULL,change_id TEXT,impact_id TEXT,source_id TEXT,action TEXT NOT NULL,
 detail TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS regulatory_events_change_date_idx ON regulatory_change_events(change_id,created_at);
