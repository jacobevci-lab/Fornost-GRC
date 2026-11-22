CREATE TABLE IF NOT EXISTS risk_appetite_risk_links (appetite_id TEXT NOT NULL, risk_id TEXT NOT NULL, PRIMARY KEY(appetite_id,risk_id));
CREATE INDEX IF NOT EXISTS risk_appetite_risk_idx ON risk_appetite_risk_links(risk_id,appetite_id);
CREATE TABLE IF NOT EXISTS risk_kri_measurement_sources (measurement_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, evidence_id TEXT NOT NULL, version_id TEXT NOT NULL, version_no INTEGER NOT NULL);
