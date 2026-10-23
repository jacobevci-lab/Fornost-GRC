import { auditMilestoneSchema, auditMilestoneSourceTriggers } from './audit-milestone-schema';
import { workpaperCapaSchema } from './workpaper-capa-schema';
import { auditWorkpaperSchema, auditWorkpaperSourceTriggers } from './audit-workpaper-schema';
import { completedInitialization } from './completed-initialization';
import { ensureAuditRequestSchema } from './audit-request-store';
import { ensureFindingsSchemaCompatibility } from './api/findings/schema-compat';

export const auditStatusReportSchema = [
  `CREATE TABLE IF NOT EXISTS audit_status_reports(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,header_json TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,item_count INTEGER NOT NULL,input_sha256 TEXT NOT NULL,write_token TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_status_reports_parent_idx ON audit_status_reports(audit_id,created_at,id)`,
  `CREATE TABLE IF NOT EXISTS audit_status_report_items(report_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(report_id,kind,id))`,
  `CREATE TABLE IF NOT EXISTS audit_report_source_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL)`,
  `INSERT OR IGNORE INTO audit_report_source_revision(id,revision) VALUES(1,lower(hex(randomblob(16))))`,
  ...['simple_audits','simple_grc_records','simple_grc_record_codes','simple_grc_metadata','audit_request_workflows','audit_requests','enterprise_findings'].flatMap(table => ['INSERT','UPDATE','DELETE'].map(operation => {
    const references = operation === 'INSERT' ? ['NEW'] : operation === 'DELETE' ? ['OLD'] : ['OLD','NEW'];
    const condition = table === 'simple_grc_records' || table === 'simple_grc_record_codes' ? references.map(ref => `${ref}.module='Denetim Yönetimi'`).join(' OR ')
      : table === 'simple_grc_metadata' ? references.map(ref => `(substr(${ref}.key,1,11)='audit_plan_' OR substr(${ref}.key,1,14)='audit_catalog_')`).join(' OR ') : '1';
    return `CREATE TRIGGER IF NOT EXISTS audit_report_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} WHEN ${condition} BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`;
  })),
];
const ready = completedInitialization();
export async function ensureAuditStatusReportSchema(db: D1Database) {
  await ready(db, async () => {
    await ensureAuditRequestSchema(db); await ensureFindingsSchemaCompatibility(db);
    await db.batch([...auditMilestoneSchema, ...auditWorkpaperSchema, ...auditStatusReportSchema, ...auditWorkpaperSourceTriggers, ...auditMilestoneSourceTriggers, ...workpaperCapaSchema].map(sql => db.prepare(sql)));
  });
}
