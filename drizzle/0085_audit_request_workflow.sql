CREATE TABLE IF NOT EXISTS audit_request_workflows (
  audit_id TEXT PRIMARY KEY, state TEXT NOT NULL, revision TEXT NOT NULL,
  time_zone TEXT NOT NULL, plan_revision TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_requests (
  id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, data_json TEXT NOT NULL,
  revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_requests_parent_idx ON audit_requests(audit_id, created_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_request_events (
  id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, request_id TEXT NOT NULL,
  action TEXT NOT NULL, actor TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_request_events_parent_idx ON audit_request_events(audit_id, created_at, id);
