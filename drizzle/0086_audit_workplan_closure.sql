CREATE TABLE IF NOT EXISTS audit_workplan_closures(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,snapshot_json TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,request_count INTEGER NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_workplan_closures_parent_idx ON audit_workplan_closures(audit_id,created_at,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_workplan_closure_items(closure_id TEXT NOT NULL,id TEXT NOT NULL,audit_id TEXT NOT NULL,data_json TEXT NOT NULL,revision TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(closure_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_workplan_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,closure_id TEXT NOT NULL,revision TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_workplan_events_parent_idx ON audit_workplan_events(audit_id,created_at,id);
