import { canReadModule, type AccessSubject } from './module-access';
import { recordLinkTarget } from './record-links';
import { ensureAuditClosureSchema } from './audit-closure-schema';
export async function resolveRecordLink(db: D1Database, actor: AccessSubject, input: unknown) {
  const target = recordLinkTarget(input);
  if (!target || !canReadModule(actor, target.module) || (target.kind === 'audit-workpaper' && !canReadModule(actor, 'Kanıtlar'))) return null;
  if (target.kind === 'record') {
    const row = await db.prepare('SELECT id FROM simple_grc_records WHERE id=? AND module=?').bind(target.ref, target.module).first();
    return row ? target : null;
  }
  await ensureAuditClosureSchema(db);
  const table = target.kind === 'audit-request' ? 'audit_requests' : target.kind === 'audit-milestone' ? 'audit_milestones' : 'audit_workpapers';
  const row = await db.prepare(`SELECT r.id FROM ${table} r JOIN simple_audits a ON a.id=r.audit_id WHERE r.id=? AND r.audit_id=?`).bind(target.ref, target.auditId).first();
  return row ? target : null;
}
