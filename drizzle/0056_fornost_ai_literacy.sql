CREATE TABLE IF NOT EXISTS ai_literacy_records (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, principal TEXT NOT NULL, display_name TEXT NOT NULL, operator_role TEXT NOT NULL,
 manager TEXT NOT NULL, required_modules_json TEXT NOT NULL, completed_modules_json TEXT NOT NULL, missing_json TEXT NOT NULL,
 score INTEGER NOT NULL, attested INTEGER NOT NULL, limitations_acknowledged INTEGER NOT NULL,
 incident_duty_acknowledged INTEGER NOT NULL, trained_at TEXT NOT NULL, valid_until TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT, UNIQUE(model_id,principal,operator_role)
);
CREATE INDEX IF NOT EXISTS ai_literacy_model_validity_idx ON ai_literacy_records(model_id,status,valid_until);
