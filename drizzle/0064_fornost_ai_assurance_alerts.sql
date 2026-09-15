CREATE TABLE IF NOT EXISTS ai_assurance_alerts (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, policy_id TEXT NOT NULL, monitoring_ref TEXT,
 metric TEXT NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL, observed_value REAL, threshold_value REAL,
 fingerprint TEXT NOT NULL UNIQUE, occurrence_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open',
 owner TEXT, action_note TEXT, finding_id TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 acknowledged_by TEXT, acknowledged_at TEXT, escalated_by TEXT, escalated_at TEXT,
 resolved_by TEXT, resolved_at TEXT, reopened_by TEXT, reopened_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_assurance_alerts_model_status_idx ON ai_assurance_alerts(model_id,status,severity,last_seen_at);
