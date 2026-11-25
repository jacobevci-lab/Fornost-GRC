CREATE TABLE IF NOT EXISTS user_module_access (
  user_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_access_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
