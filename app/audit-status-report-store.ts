import type { Actor } from './api/auth/security';
import { emptyAuditPlan, validateAuditPlan } from './audit-plan';
import { auditRequestId, publicAuditRequest } from './audit-request-store';
import { findingReportRecord } from './findings/reporting';
import { ensureAuditStatusReportSchema } from './audit-status-report-schema';
import { AuditReportError, auditReportHash, auditReportLimits, type AuditReportDetail, type AuditReportItem, type AuditReportSource, type AuditStatusReport } from './audit-status-report';

export function requireAuditReportAccess(actor: Actor) { if (actor.role !== 'Admin') throw new AuditReportError('forbidden', 403); }
const object = (value: string) => { const data = JSON.parse(value); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AuditReportError('source-invalid', 503); return data; };
type Raw = Record<string, unknown>;
const requirements = `SELECT r.*,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=(SELECT name FROM simple_audits WHERE id=?)`;
const linkedFindings = `SELECT f.* FROM enterprise_findings f WHERE f.source_type='audit' AND (f.source_ref=? OR EXISTS(SELECT 1 FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=(SELECT name FROM simple_audits WHERE id=?) AND (f.source_ref=r.id OR f.source_ref=c.code)))`;
const ambiguousFinding = `((SELECT count(*) FROM simple_audits a WHERE a.id=f.source_ref)+(SELECT count(*) FROM simple_grc_records r WHERE r.module='Denetim Yönetimi' AND (r.id=f.source_ref OR EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=r.id AND c.code=f.source_ref))))<>1`;

export async function readAuditReportSource(db: D1Database, actor: Actor, auditId: string): Promise<AuditReportSource> {
  requireAuditReportAccess(actor); auditRequestId(auditId); await ensureAuditStatusReportSchema(db);
  // One transactional read: the token, scope, plan and every row belong to the same state.
  const result = await db.batch([
    db.prepare('SELECT revision FROM audit_report_source_revision WHERE id=1'),
    db.prepare('SELECT * FROM simple_audits WHERE id=?').bind(auditId),
    db.prepare('SELECT key,value FROM simple_grc_metadata WHERE key IN (?,?)').bind(`audit_plan_${auditId}`, `audit_catalog_${auditId}`),
    db.prepare(`${requirements} ORDER BY r.id LIMIT 2001`).bind(auditId),
    db.prepare('SELECT * FROM audit_requests WHERE audit_id=? ORDER BY id LIMIT 501').bind(auditId),
    db.prepare('SELECT * FROM audit_request_workflows WHERE audit_id=?').bind(auditId),
    db.prepare(`${linkedFindings} ORDER BY f.id LIMIT 1001`).bind(auditId, auditId),
    db.prepare(`SELECT count(*) AS invalid FROM simple_grc_records WHERE module='Denetim Yönetimi' AND CASE WHEN NOT json_valid(data_json) THEN 1 WHEN json_type(data_json)<>'object' THEN 1 WHEN COALESCE(json_type(data_json,'$.auditName'),'')<>'text' THEN 1 WHEN trim(json_extract(data_json,'$.auditName'))='' THEN 1 ELSE 0 END`),
    db.prepare(`SELECT count(*) AS ambiguous FROM (${linkedFindings} AND ${ambiguousFinding})`).bind(auditId,auditId),
  ]);
  const a = result[1].results[0] as Raw | undefined;
  if (!a) throw new AuditReportError('audit-missing', 404);
  if (Number((result[7].results[0] as Raw)?.invalid)) throw new AuditReportError('source-invalid', 503);
  if (Number((result[8].results[0] as Raw)?.ambiguous)) throw new AuditReportError('scope-ambiguous',409);
  if (result[3].results.length > auditReportLimits.requirement || result[4].results.length > auditReportLimits.request || result[6].results.length > auditReportLimits.finding) throw new AuditReportError('limit', 409);
  const metadata = new Map((result[2].results as { key: string; value: string }[]).map(row => [row.key, object(row.value)]));
  const plan = metadata.get(`audit_plan_${auditId}`) || { plan: emptyAuditPlan, revision: '', updatedAt: null, updatedBy: null };
  try { validateAuditPlan(plan.plan); } catch { throw new AuditReportError('source-invalid', 503); }
  if (typeof plan.revision !== 'string') throw new AuditReportError('source-invalid', 503);
  const w = result[5].results[0] as Raw | undefined;
  const items: AuditReportItem[] = [
    ...(result[3].results as Raw[]).map(row => ({ kind: 'requirement' as const, id: String(row.id), record: { id: String(row.id), code: String(row.code || row.id), module: 'Denetim Yönetimi', data: object(String(row.data_json)), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } })),
    ...(result[4].results as unknown as Parameters<typeof publicAuditRequest>[0][]).map(raw => { object(raw.data_json); const row = publicAuditRequest(raw); if (!row.title || !row.status || !Array.isArray(row.evidence)) throw new AuditReportError('source-invalid',503); return { kind: 'request' as const, id: row.id, record: { id: row.id, module: 'Audit requests', data: { ...row }, createdAt: row.createdAt, updatedAt: row.updatedAt } }; }),
    ...(result[6].results as Raw[]).map(row => ({ kind: 'finding' as const, id: String(row.id), record: findingReportRecord(row) })),
  ].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const source: AuditReportSource = {
    sourceRevision: String((result[0].results[0] as Raw)?.revision || ''),
    audit: { id: String(a.id), name: String(a.name), template: String(a.template), auditType: String(a.audit_type), auditor: String(a.auditor), owner: String(a.audit_owner), status: String(a.status) },
    catalog: metadata.get(`audit_catalog_${auditId}`) || null,
    plan,
    workflow: { auditId, state: w ? w.state as AuditReportSource['workflow']['state'] : 'draft', revision: String(w?.revision || ''), timeZone: String(w?.time_zone || 'UTC'), planRevision: String(w?.plan_revision || '') }, items,
  };
  if (!/^[a-f0-9]{32}$/.test(source.sourceRevision)) throw new AuditReportError('source-invalid', 503);
  if (new TextEncoder().encode(JSON.stringify(source)).length > auditReportLimits.bytes) throw new AuditReportError('limit', 409);
  return source;
}

export async function listAuditStatusReports(db: D1Database, actor: Actor, auditId: string) {
  requireAuditReportAccess(actor); auditRequestId(auditId); await ensureAuditStatusReportSchema(db);
  const results = await db.batch([
    db.prepare('SELECT id FROM simple_audits WHERE id=?').bind(auditId),
    db.prepare('SELECT id,header_json,item_count FROM audit_status_reports WHERE audit_id=? ORDER BY created_at DESC,rowid DESC LIMIT 21').bind(auditId),
  ]);
  if (!results[0].results.length) throw new AuditReportError('audit-missing', 404);
  return { complete: results[1].results.length <= 20, reports: (results[1].results as { id: string; header_json: string; item_count: number }[]).slice(0, 20).map(row => { const header = object(row.header_json); return { id: row.id, title: String(header.title), createdAt: String(header.createdAt), createdBy: String(header.createdBy), itemCount: row.item_count }; }) };
}

export async function readAuditStatusReport(db: D1Database, actor: Actor, auditId: string, reportId: string): Promise<AuditReportDetail> {
  requireAuditReportAccess(actor); auditRequestId(auditId); auditRequestId(reportId); await ensureAuditStatusReportSchema(db);
  const results = await db.batch([
    db.prepare('SELECT header_json,snapshot_sha256,item_count FROM audit_status_reports WHERE id=? AND audit_id=? AND EXISTS(SELECT 1 FROM simple_audits WHERE id=?)').bind(reportId, auditId, auditId),
    db.prepare('SELECT kind,id,record_json FROM audit_status_report_items WHERE report_id=? ORDER BY kind,id LIMIT 3501').bind(reportId),
  ]);
  const h = results[0].results[0] as { header_json: string; snapshot_sha256: string; item_count: number } | undefined;
  if (!h) throw new AuditReportError('report-missing', 404);
  const items = (results[1].results as { kind: AuditReportItem['kind']; id: string; record_json: string }[]).map(row => ({ kind: row.kind, id: row.id, record: object(row.record_json) }));
  const snapshot = { ...object(h.header_json), items } as AuditStatusReport;
  const integrity = items.length !== h.item_count || items.length > 3500 ? 'unavailable' : await auditReportHash(snapshot) === h.snapshot_sha256 ? 'verified' : 'broken';
  return { snapshot, sha256: h.snapshot_sha256, integrity };
}

export async function createAuditStatusReport(db: D1Database, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  requireAuditReportAccess(actor);
  const auditId = auditRequestId(input.auditId), reportId = auditRequestId(input.reportId);
  if (!/^ARP-[a-f0-9-]{36}$/.test(reportId) || typeof input.expectedSourceRevision !== 'string' || !/^[a-f0-9]{32}$/.test(input.expectedSourceRevision)) throw new AuditReportError('fields');
  const fields: Record<string, string> = {};
  for (const [key, min, max] of [['title', 3, 200], ['summary', 10, 4000], ['limitations', 0, 4000]] as const) {
    if (typeof input[key] !== 'string' || input[key].trim().length < min || input[key].length > max) throw new AuditReportError('fields');
    fields[key] = input[key].trim();
  }
  await ensureAuditStatusReportSchema(db);
  const fingerprint = await auditReportHash({ auditId, actor: actor.email, expectedSourceRevision: input.expectedSourceRevision, ...fields });
  const existing = () => db.prepare('SELECT input_sha256,audit_id FROM audit_status_reports WHERE id=? AND EXISTS(SELECT 1 FROM simple_audits WHERE id=?)').bind(reportId, auditId).first<{ input_sha256: string; audit_id: string }>();
  const prior = await existing();
  if (prior) { if (prior.input_sha256 !== fingerprint || prior.audit_id !== auditId) throw new AuditReportError('id-conflict', 409); return { id: reportId }; }
  const source = await readAuditReportSource(db, actor, auditId);
  if (source.sourceRevision !== input.expectedSourceRevision) throw new AuditReportError('changed', 409);
  const snapshot: AuditStatusReport = { ...source, schemaVersion: 1, id: reportId, title: fields.title, summary: fields.summary, limitations: fields.limitations, createdAt: now.toISOString(), createdBy: actor.email };
  const { items, ...header } = snapshot, sha256 = await auditReportHash(snapshot), writeToken = crypto.randomUUID();
  const chunks: AuditReportItem[][] = []; let chunk: AuditReportItem[] = [], bytes = 0;
  for (const item of items) {
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    if (size > 400_000) throw new AuditReportError('limit', 409);
    if (chunk.length && bytes + size > 400_000) { chunks.push(chunk); chunk = []; bytes = 0; }
    chunk.push(item); bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  const results = await db.batch([
    db.prepare(`INSERT INTO audit_status_reports(id,audit_id,header_json,snapshot_sha256,item_count,input_sha256,write_token,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?) AND EXISTS(SELECT 1 FROM audit_report_source_revision WHERE id=1 AND revision=?) ON CONFLICT(id) DO NOTHING RETURNING id`)
      .bind(reportId, auditId, JSON.stringify(header), sha256, items.length, fingerprint, writeToken, header.createdAt, auditId, input.expectedSourceRevision),
    ...chunks.map(rows => db.prepare(`INSERT INTO audit_status_report_items(report_id,kind,id,record_json) SELECT ?,json_extract(value,'$.kind'),json_extract(value,'$.id'),json_extract(value,'$.record') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM audit_status_reports WHERE id=? AND write_token=?)`).bind(reportId, JSON.stringify(rows), reportId, writeToken)),
  ]);
  if (!results[0].results.length) { const saved = await existing(); if (!saved || saved.audit_id !== auditId || saved.input_sha256 !== fingerprint) throw new AuditReportError('changed', 409); }
  return { id: reportId };
}
