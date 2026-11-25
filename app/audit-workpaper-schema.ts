export const auditWorkpaperSchema = [
  `CREATE TABLE IF NOT EXISTS audit_workpapers(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,revision TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_workpapers_parent_idx ON audit_workpapers(audit_id,updated_at,id)`,
  `CREATE TABLE IF NOT EXISTS audit_workpaper_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,workpaper_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_workpaper_events_parent_idx ON audit_workpaper_events(audit_id,workpaper_id,created_at,id)`,
];
export const auditWorkpaperSourceTriggers = ['INSERT', 'UPDATE', 'DELETE'].map(operation =>
  `CREATE TRIGGER IF NOT EXISTS audit_report_audit_workpapers_${operation.toLowerCase()} AFTER ${operation} ON audit_workpapers BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`);
export const auditWorkpaperClosureGuards = ['INSERT', 'UPDATE', 'DELETE'].map(operation => {
  const refs = operation === 'INSERT' ? ['NEW'] : operation === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
  return `CREATE TRIGGER IF NOT EXISTS audit_closure_audit_workpapers_${operation.toLowerCase()} BEFORE ${operation} ON audit_workpapers WHEN ${refs.map(ref => `EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=${ref}.audit_id AND state='closed')`).join(' OR ')} BEGIN SELECT RAISE(ABORT,'audit-closed'); END`;
});
