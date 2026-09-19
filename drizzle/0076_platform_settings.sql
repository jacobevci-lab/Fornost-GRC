CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_setting_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_setting_events_created_idx ON platform_setting_events(created_at);
