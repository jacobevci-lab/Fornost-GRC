CREATE TABLE IF NOT EXISTS ai_incidents (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_id TEXT, type TEXT NOT NULL, severity TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL, detected_by TEXT NOT NULL, impact TEXT NOT NULL,
 personal_data INTEGER NOT NULL DEFAULT 0, regulatory_impact INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'open', owner TEXT, sla_due_at TEXT NOT NULL, containment TEXT,
 root_cause TEXT, corrective_action TEXT, notification_decision TEXT, decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 resolved_by TEXT, resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_incidents_status_severity_idx ON ai_incidents(status,severity,sla_due_at);
CREATE TABLE IF NOT EXISTS ai_incident_events (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL,
 detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_incident_events_incident_idx ON ai_incident_events(incident_id,created_at);
