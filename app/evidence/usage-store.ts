import { canReadModule, isScoped, type AccessSubject } from '../module-access';
import { EvidenceUsageError, usageReferences, usagePins, usageNeedsReview, type EvidenceUsage, type EvidenceUsageRow, type UsageSource } from './usage';
const str = (value: unknown) => typeof value === 'string' ? value : '';
const object = (value: string) => JSON.parse(value) as Record<string, unknown>;

type Anchor = { id: string; code: string | null; data_json: string; updated_at: string; version_id: string | null; version_no: number | null };
async function readAnchor(db: D1Database, id: string) {
  return db.prepare(`SELECT r.id,c.code,r.data_json,r.updated_at,v.id AS version_id,v.version_no
    FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id
    LEFT JOIN evidence_versions v ON v.id=(SELECT id FROM evidence_versions WHERE evidence_id=r.id ORDER BY version_no DESC LIMIT 1)
    WHERE r.id=? AND r.module='Kanıtlar'`).bind(id).first<Anchor>();
}
/** Read-only, bounded current usage. Historic event/report snapshots are deliberately excluded. */
export async function readEvidenceUsage(db: D1Database, actor: AccessSubject, id: string): Promise<EvidenceUsage> {
  if (!canReadModule(actor, 'Kanıtlar')) throw new EvidenceUsageError('forbidden', 403);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new EvidenceUsageError('id', 400);
  const anchor = await readAnchor(db, id);
  if (!anchor) throw new EvidenceUsageError('missing', 404);
  const data = object(anchor.data_json);
  const evidence: EvidenceUsage['evidence'] = { id, code: anchor.code || id, title: str(data.evidenceTitle) || id, versionId: anchor.version_id || '', versionNo: anchor.version_no || 0, updatedAt: anchor.updated_at };
  const result: EvidenceUsage = { evidence, checkedAt: new Date().toISOString(), sources: [], rows: [], unresolvedControls: [] };
  const refs = new Set([id.toLowerCase(), evidence.code.toLowerCase()]);
  const linked = (value: unknown) => usageReferences(value).some(ref => refs.has(ref));
  const add = (source: UsageSource, row: Omit<EvidenceUsageRow, 'source'>) => result.rows.push({ ...row, source });
  async function source(key: UsageSource, allowed: boolean, limit: number, read: () => Promise<boolean>) {
    if (!allowed) { result.sources.push({ key, state: 'restricted', limit }); return; }
    const start = result.rows.length;
    try { result.sources.push({ key, state: await read() ? 'complete' : 'limited', limit }); }
    catch { result.rows.splice(start); result.sources.push({ key, state: 'unavailable', limit }); }
  }
  // Per-source reads are sequential so a failed source can discard only its own projection.
  const modules = ['Kontroller', 'Uyum'].filter(module => canReadModule(actor, module));
  await source('controls', modules.length > 0, 100, async () => {
    const controls = [...new Set(usageReferences([data.controlRef, data.controlRefs]))];
    for (const ref of controls.slice(0, 100)) {
      const found = await db.prepare(`SELECT r.id,r.module,r.data_json,c.code,
        CASE WHEN lower(r.id)=? THEN 0 WHEN lower(c.code)=? THEN 1 ELSE 2 END AS tier
        FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id
        WHERE r.module IN (SELECT value FROM json_each(?)) AND
        (lower(r.id)=? OR lower(c.code)=? OR lower(trim(json_extract(r.data_json,'$.controlId')))=?) ORDER BY tier,r.id LIMIT 2`)
        .bind(ref, ref, JSON.stringify(modules), ref, ref, ref).all<{ id: string; module: string; data_json: string; code: string; tier: number }>();
      const first = found.results[0];
      if (!first || found.results[1]?.tier === first.tier) { result.unresolvedControls.push(ref); continue; }
      if (result.rows.some(r => r.source === 'controls' && r.id === first.id)) continue;
      const d = object(first.data_json);
      add('controls', { id: first.id, module: first.module, title: str(d.controlTitle || d.title || d.controlId) || first.code || first.id,
        owner: str(d.owner), status: str(d.status), dueDate: '', historical: false, pins: [],
        target: { module: first.module, ref: first.id, source: 'evidence-usage' } });
    }
    return controls.length <= 100 && modules.length === 2;
  });
  await source('requirements', canReadModule(actor, 'Denetim Yönetimi'), 1000, async () => {
    const rows = await db.prepare("SELECT id,data_json FROM simple_grc_records WHERE module='Denetim Yönetimi' ORDER BY updated_at DESC,id LIMIT 1001").all<{ id: string; data_json: string }>();
    for (const row of rows.results.slice(0, 1000)) {
      const d = object(row.data_json); if (!linked(d.evidenceRef)) continue;
      add('requirements', { id: row.id, module: 'Denetim Yönetimi', title: str(d.requirementTitle || d.requirement || d.controlTitle || d.requirementRef || d.auditName) || row.id,
        owner: str(d.owner), status: str(d.status), dueDate: '', historical: false, pins: [], target: { module: 'Denetim Yönetimi', ref: row.id, source: 'evidence-usage' } });
    }
    return rows.results.length <= 1000;
  });
  for (const [key, table, kind] of [['requests', 'audit_requests', 'audit-request'], ['workpapers', 'audit_workpapers', 'audit-workpaper']] as const) {
    await source(key, canReadModule(actor, 'Denetim Yönetimi'), 200, async () => {
      const rows = await db.prepare(`SELECT p.id,p.audit_id,a.name AS audit_name,c.state AS closure_state,
        json_extract(p.data_json,'$.title') AS title,json_extract(p.data_json,'$.status') AS status,
        json_extract(p.data_json,'$.owner') AS owner,json_extract(p.data_json,'$.reviewer') AS reviewer,
        json_extract(p.data_json,'$.dueDate') AS due_date,json_extract(p.data_json,'$.reviewDueDate') AS review_due_date,
        (SELECT json_group_array(json_object('id',json_extract(e.value,'$.id'),'evidenceId',json_extract(e.value,'$.evidenceId'),
          'versionNo',json_extract(e.value,'$.versionNo'),'available',EXISTS(SELECT 1 FROM evidence_versions v WHERE v.id=json_extract(e.value,'$.id')
          AND v.evidence_id=? AND v.version_no=json_extract(e.value,'$.versionNo') AND v.content_sha256=json_extract(e.value,'$.contentSha256'))))
          FROM json_each(p.data_json,'$.evidence') e WHERE json_extract(e.value,'$.evidenceId')=?) AS pins_json
        FROM ${table} p JOIN simple_audits a ON a.id=p.audit_id LEFT JOIN audit_closure_state c ON c.audit_id=p.audit_id
        WHERE EXISTS(SELECT 1 FROM json_each(p.data_json,'$.evidence') e WHERE json_extract(e.value,'$.evidenceId')=?)
        ORDER BY p.updated_at DESC,p.id LIMIT 201`).bind(id, id, id).all<Record<string, string>>();
      for (const row of rows.results.slice(0, 200)) {
        const status = str(row.status), review = status === 'submitted';
        add(key, { id: row.id, module: 'Denetim Yönetimi', title: `${row.title || row.id} · ${row.audit_name}`,
          owner: str(review ? row.reviewer : row.owner), status, dueDate: str(review ? row.review_due_date : row.due_date),
          historical: row.closure_state === 'closed' || ['accepted', 'approved', 'cancelled'].includes(status),
          pins: usagePins(JSON.parse(row.pins_json), evidence), target: { module: 'Denetim Yönetimi', ref: row.id, kind, filter: { auditId: row.audit_id }, source: 'evidence-usage' } });
      }
      return rows.results.length <= 200;
    });
  }
  await source('findings', !isScoped(actor), 1000, async () => {
    const rows = await db.prepare(`SELECT id,code,title,owner,status,due_date,evidence_reference,verification_evidence_reference
      FROM enterprise_findings ORDER BY updated_at DESC,id LIMIT 1001`).all<Record<string, string>>();
    for (const row of rows.results.slice(0, 1000)) {
      if (!linked(row.evidence_reference) && !linked(row.verification_evidence_reference)) continue;
      add('findings', { id: row.id, module: 'Bulgular ve CAPA', title: `${row.code} · ${row.title}`, owner: row.owner,
        status: row.status, dueDate: row.due_date, historical: ['closed', 'accepted'].includes(row.status), pins: [],
        target: { module: 'Bulgular ve CAPA', ref: row.id, kind: 'finding', source: 'evidence-usage' } });
    }
    return rows.results.length <= 1000;
  });
  // Never compare pins against an anchor that changed while the source reads ran.
  const end = await readAnchor(db, id);
  if (!end || JSON.stringify(end) !== JSON.stringify(anchor)) throw new EvidenceUsageError('changed', 409);
  result.rows.sort((a, b) => Number(usageNeedsReview(b)) - Number(usageNeedsReview(a)) || Number(a.historical) - Number(b.historical) || a.title.localeCompare(b.title));
  return result;
}
