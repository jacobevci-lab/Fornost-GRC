CREATE TABLE IF NOT EXISTS ai_operating_policy (
  id TEXT PRIMARY KEY,
  emergency_stop INTEGER NOT NULL DEFAULT 0,
  chat_enabled INTEGER NOT NULL DEFAULT 1,
  drafts_enabled INTEGER NOT NULL DEFAULT 1,
  agents_enabled INTEGER NOT NULL DEFAULT 1,
  retrieval_enabled INTEGER NOT NULL DEFAULT 1,
  evaluations_enabled INTEGER NOT NULL DEFAULT 1,
  viewer_chat INTEGER NOT NULL DEFAULT 1,
  editor_chat INTEGER NOT NULL DEFAULT 1,
  maintenance_message TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
PRAGMA optimize;
