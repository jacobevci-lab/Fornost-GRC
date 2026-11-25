CREATE TABLE IF NOT EXISTS ai_model_artifacts (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, version TEXT NOT NULL, artifact_type TEXT NOT NULL, source TEXT NOT NULL,
 supplier TEXT NOT NULL, sha256 TEXT NOT NULL, signature_verified INTEGER NOT NULL, signature_issuer TEXT NOT NULL,
 license TEXT NOT NULL, sbom_reference TEXT NOT NULL, scanner TEXT NOT NULL, scan_date TEXT NOT NULL,
 malware_clean INTEGER NOT NULL, critical_vulnerabilities INTEGER NOT NULL, high_vulnerabilities INTEGER NOT NULL,
 unsafe_formats INTEGER NOT NULL, reproducible INTEGER NOT NULL, provenance TEXT NOT NULL, valid_until TEXT NOT NULL,
 blockers_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 UNIQUE(model_id,version,sha256)
);
CREATE INDEX IF NOT EXISTS ai_model_artifact_release_idx ON ai_model_artifacts(model_id,status,valid_until);
