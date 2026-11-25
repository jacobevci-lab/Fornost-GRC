CREATE TABLE IF NOT EXISTS ai_transparency_profiles (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, intended_use TEXT NOT NULL, prohibited_uses TEXT NOT NULL,
 capabilities TEXT NOT NULL, limitations TEXT NOT NULL, explanation_method TEXT NOT NULL, human_oversight TEXT NOT NULL,
 notice_text TEXT NOT NULL, appeal_channel TEXT NOT NULL, owner TEXT NOT NULL, affected_groups TEXT NOT NULL,
 languages_json TEXT NOT NULL, review_date TEXT NOT NULL, gaps_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_transparency_review_idx ON ai_transparency_profiles(status,review_date);

CREATE TABLE IF NOT EXISTS ai_oversight_events (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, decision_reference TEXT NOT NULL, action TEXT NOT NULL, severity TEXT NOT NULL,
 reason TEXT NOT NULL, outcome TEXT NOT NULL, control_owner TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
 resolution_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, resolved_by TEXT, resolved_at TEXT,
 UNIQUE(model_id,decision_reference,action)
);
CREATE INDEX IF NOT EXISTS ai_oversight_status_idx ON ai_oversight_events(model_id,status,severity,created_at);
