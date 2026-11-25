CREATE TABLE IF NOT EXISTS simple_grc_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simple_audits (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  auditor TEXT NOT NULL,
  audit_owner TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simple_grc_record_codes (
  record_id TEXT PRIMARY KEY NOT NULL,
  module TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simple_grc_record_code_counters (
  module TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
