CREATE TABLE IF NOT EXISTS incident_crisis_context(
 incident_id TEXT PRIMARY KEY NOT NULL, detected_at TEXT, vendor_ref TEXT, awareness_at TEXT,
 notification_regime TEXT, notification_scope TEXT);
