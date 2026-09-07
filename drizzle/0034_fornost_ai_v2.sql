CREATE TABLE IF NOT EXISTS ai_draft_tickets (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  provider TEXT,
  external_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL,
  publication_note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS ai_draft_tickets_status_idx ON ai_draft_tickets(status,created_at);
