import { completedInitialization } from './completed-initialization';
import { ensureAuditStatusReportSchema } from './audit-status-report-schema';

const closed = (query: string) => `EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.state='closed' AND c.audit_id IN (${query}))`;
export const auditClosureSchema = [
  `CREATE TABLE IF NOT EXISTS audit_closure_state(audit_id TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('open','pending','closed')),revision TEXT NOT NULL,submission_id TEXT NOT NULL,report_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_closure_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,payload_json TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,input_sha256 TEXT NOT NULL,write_token TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_closure_events_parent_idx ON audit_closure_events(audit_id,created_at,id)`,
  // Detect package corruption between verification and approval. Ordinary report
  // creation is not a source edit; adding rows to an already submitted package is.
  ...['audit_status_reports', 'audit_status_report_items'].flatMap(table => ['UPDATE', 'DELETE'].map(operation =>
    `CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`)),
  `CREATE TRIGGER IF NOT EXISTS audit_closure_integrity_item_insert AFTER INSERT ON audit_status_report_items WHEN EXISTS(SELECT 1 FROM audit_closure_state WHERE report_id=NEW.report_id) BEGIN UPDATE audit_report_source_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END`,
  ...['simple_audits', 'simple_grc_records', 'simple_grc_record_codes', 'simple_grc_metadata', 'audit_requests', 'audit_request_workflows'].flatMap(table =>
    ['INSERT', 'UPDATE', 'DELETE'].map(operation => {
      const refs = operation === 'INSERT' ? ['NEW'] : operation === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
      const condition = refs.map(ref => {
        if (table === 'simple_audits') return closed(`SELECT ${ref}.id`);
        if (table === 'simple_grc_records') return `(${ref}.module='Denetim Yönetimi' AND ${closed(`SELECT id FROM simple_audits WHERE name=json_extract(${ref}.data_json,'$.auditName')`)})`;
        if (table === 'simple_grc_record_codes' && operation === 'INSERT') return `EXISTS(SELECT 1 FROM simple_grc_record_codes WHERE record_id=NEW.record_id) AND ${closed(`SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=NEW.record_id`)}`;
        if (table === 'simple_grc_record_codes') return closed(`SELECT a.id FROM simple_audits a JOIN simple_grc_records r ON r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=a.name WHERE r.id=${ref}.record_id`);
        if (table === 'simple_grc_metadata') return closed(`SELECT id FROM simple_audits WHERE ${ref}.key='audit_plan_'||id OR ${ref}.key='audit_catalog_'||id`);
        return closed(`SELECT ${ref}.audit_id`);
      }).join(' OR ');
      return `CREATE TRIGGER IF NOT EXISTS audit_closure_${table}_${operation.toLowerCase()} BEFORE ${operation} ON ${table} WHEN ${condition} BEGIN SELECT RAISE(ABORT,'audit-closed'); END`;
    })),
];
const initialize = completedInitialization();
export async function ensureAuditClosureSchema(db: D1Database) {
  await initialize(db, async () => { await ensureAuditStatusReportSchema(db); await db.batch(auditClosureSchema.map(sql => db.prepare(sql))); });
}
