CREATE TABLE IF NOT EXISTS ai_release_gates (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_id TEXT NOT NULL, version TEXT NOT NULL,
 environment TEXT NOT NULL, release_owner TEXT NOT NULL, rollback_owner TEXT NOT NULL,
 rollback_plan TEXT NOT NULL, planned_at TEXT NOT NULL, readiness_score INTEGER NOT NULL,
 checks_json TEXT NOT NULL, blockers_json TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested', decision_note TEXT, valid_until TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_release_gate_model_status_idx ON ai_release_gates(model_id,status,planned_at);
