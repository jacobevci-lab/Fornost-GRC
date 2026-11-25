export const workpaperCapaSchema = [
  `CREATE TABLE IF NOT EXISTS audit_workpaper_capa_links(finding_id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,workpaper_id TEXT NOT NULL,sample_key TEXT NOT NULL,source_revision TEXT NOT NULL,input_sha256 TEXT NOT NULL,origin_json TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_workpaper_capa_parent_idx ON audit_workpaper_capa_links(audit_id,workpaper_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS audit_workpaper_capa_sample_unique ON audit_workpaper_capa_links(workpaper_id,sample_key)`,
  ...['UPDATE', 'DELETE'].map(op => `CREATE TRIGGER IF NOT EXISTS audit_workpaper_capa_immutable_${op.toLowerCase()} BEFORE ${op} ON audit_workpaper_capa_links BEGIN SELECT RAISE(ABORT,'immutable-workpaper-capa'); END`),
  `CREATE TRIGGER IF NOT EXISTS audit_workpaper_capa_source_insert AFTER INSERT ON audit_workpaper_capa_links BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`,
  `CREATE TRIGGER IF NOT EXISTS audit_workpaper_capa_closed_insert BEFORE INSERT ON audit_workpaper_capa_links WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=NEW.audit_id AND state='closed') BEGIN SELECT RAISE(ABORT,'audit-closed'); END`,
];
