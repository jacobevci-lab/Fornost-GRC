CREATE TABLE IF NOT EXISTS installation_license (
  id INTEGER PRIMARY KEY CHECK(id=1),
  installation TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  highest INTEGER NOT NULL DEFAULT -1,
  updated_by TEXT,
  updated_at TEXT
);
