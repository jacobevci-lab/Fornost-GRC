CREATE TABLE IF NOT EXISTS ai_control_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, framework TEXT NOT NULL, control_id TEXT NOT NULL,
 domain TEXT NOT NULL, title TEXT NOT NULL, requirement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not-started',
 owner TEXT NOT NULL, due_date TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(model_id,framework,control_id)
);
CREATE INDEX IF NOT EXISTS ai_control_assessments_model_status_idx ON ai_control_assessments(model_id,status,due_date);
