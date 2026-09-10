CREATE TABLE IF NOT EXISTS ai_feedback (id TEXT PRIMARY KEY,activity_id TEXT NOT NULL,kind TEXT NOT NULL,severity TEXT NOT NULL,comment TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',assigned_to TEXT,resolution_note TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,resolved_by TEXT,resolved_at TEXT,UNIQUE(activity_id,created_by));
CREATE INDEX IF NOT EXISTS ai_feedback_status_severity_created_idx ON ai_feedback(status,severity,created_at);
CREATE INDEX IF NOT EXISTS ai_feedback_creator_created_idx ON ai_feedback(created_by,created_at);
