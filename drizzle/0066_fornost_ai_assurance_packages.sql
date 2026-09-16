CREATE TABLE IF NOT EXISTS ai_assurance_packages (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  period_days INTEGER NOT NULL,
  period_since TEXT NOT NULL,
  period_until TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL UNIQUE,
  signature_algorithm TEXT NOT NULL,
  signature_value TEXT NOT NULL,
  signing_key_id TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  verification_count INTEGER NOT NULL DEFAULT 0,
  last_verified_by TEXT,
  last_verified_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_assurance_packages_model_date_idx
  ON ai_assurance_packages(model_id,generated_at);
