export const auditMilestoneSchema = [
 `CREATE TABLE IF NOT EXISTS audit_milestones(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,revision TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS audit_milestones_parent_idx ON audit_milestones(audit_id,updated_at,id)`,
 `CREATE TABLE IF NOT EXISTS audit_milestone_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,milestone_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS audit_milestone_events_parent_idx ON audit_milestone_events(audit_id,milestone_id,created_at,id)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS audit_milestones_evidence_change_unique ON audit_milestones(json_extract(data_json,'$.evidenceChangeOrigin.key')) WHERE json_type(data_json,'$.evidenceChangeOrigin')='object'`,
 `CREATE TRIGGER IF NOT EXISTS audit_milestone_evidence_origin_immutable BEFORE UPDATE ON audit_milestones WHEN json_extract(OLD.data_json,'$.evidenceChangeOrigin') IS NOT json_extract(NEW.data_json,'$.evidenceChangeOrigin') BEGIN SELECT RAISE(ABORT,'immutable-evidence-origin'); END`,
];
export const auditMilestoneSourceTriggers = ['INSERT','UPDATE','DELETE'].map(operation=>`CREATE TRIGGER IF NOT EXISTS audit_report_audit_milestones_${operation.toLowerCase()} AFTER ${operation} ON audit_milestones BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`);
export const auditMilestoneClosureGuards = ['INSERT','UPDATE','DELETE'].map(operation=>{
 const refs=operation==='INSERT'?['NEW']:operation==='DELETE'?['OLD']:['OLD','NEW'];
 return `CREATE TRIGGER IF NOT EXISTS audit_closure_audit_milestones_${operation.toLowerCase()} BEFORE ${operation} ON audit_milestones WHEN ${refs.map(ref=>`EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=${ref}.audit_id AND state='closed')`).join(' OR ')} BEGIN SELECT RAISE(ABORT,'audit-closed'); END`;
});
