import { AuditRequestError } from './audit-requests';

/** Stable record identity, never a title or a shared framework reference. */
export function auditRequirementLink(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new AuditRequestError('requirement-link');
  return value;
}

export const auditRequirementLinkGuard = `AND (?='' OR EXISTS(
  SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName')
  WHERE r.id=? AND r.module='Denetim Yönetimi' AND a.id=?))`;

export async function requireAuditRequirementLink(db: D1Database, auditId: string, id: string) {
  if (!id) return;
  if (!await db.prepare(`SELECT r.id FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=? AND r.module='Denetim Yönetimi' AND a.id=?`).bind(id, auditId).first()) throw new AuditRequestError('requirement-link', 409);
}
