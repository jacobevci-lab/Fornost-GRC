CREATE TABLE IF NOT EXISTS workflow_evidence_pins(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,workflow TEXT NOT NULL,entity_id TEXT NOT NULL,purpose TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS workflow_evidence_pins_entity_idx ON workflow_evidence_pins(workflow,entity_id,purpose,created_at,id);
CREATE TRIGGER IF NOT EXISTS workflow_evidence_pin_immutable BEFORE UPDATE ON workflow_evidence_pins BEGIN SELECT RAISE(ABORT,'immutable-workflow-evidence'); END;
