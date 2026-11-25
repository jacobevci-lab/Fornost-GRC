CREATE TABLE IF NOT EXISTS ai_data_protection_policy (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'redact',
  redact_tckn INTEGER NOT NULL DEFAULT 1, redact_iban INTEGER NOT NULL DEFAULT 1,
  redact_payment_card INTEGER NOT NULL DEFAULT 1, redact_email INTEGER NOT NULL DEFAULT 1,
  redact_phone INTEGER NOT NULL DEFAULT 1, injection_detection INTEGER NOT NULL DEFAULT 1,
  injection_action TEXT NOT NULL DEFAULT 'neutralize', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_data_protection_events (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, operation TEXT NOT NULL, direction TEXT NOT NULL,
  action TEXT NOT NULL, categories_json TEXT NOT NULL DEFAULT '[]', finding_count INTEGER NOT NULL DEFAULT 0,
  event_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_data_protection_events_created_idx ON ai_data_protection_events(created_at,action);
