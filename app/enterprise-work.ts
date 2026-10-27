import { requestNextDue, type AuditRequest } from './audit-requests';
export const enterpriseWorkSources = [
  { key: 'policy', path: '/api/policy-lifecycle' },
  { key: 'vendor', path: '/api/third-party-risk' },
  { key: 'regulatory', path: '/api/regulatory-intelligence' },
  { key: 'continuity', path: '/api/continuity?view=work' },
  { key: 'audit', path: '/api/audits/requests' },
] as const;
export type EnterpriseWorkSource = typeof enterpriseWorkSources[number]['key'];
export const continuityWorkLabels: Record<string, { tr: string; en: string }> = {
  draft: { tr: 'Onay bekliyor', en: 'Awaiting approval' },
  approved: { tr: 'Etkinleştirme bekliyor', en: 'Awaiting activation' },
  active: { tr: 'Etkin', en: 'Active' },
  retired: { tr: 'Kullanımdan kaldırıldı', en: 'Retired' },
  planned: { tr: 'Planlandı', en: 'Planned' },
  completed: { tr: 'Tamamlandı', en: 'Completed' },
  cancelled: { tr: 'İptal edildi', en: 'Cancelled' },
  open: { tr: 'Açık', en: 'Open' },
  closed: { tr: 'Kapatıldı', en: 'Closed' },
};
type RecordData = Record<string, unknown>;
export type EnterpriseWorkRow = {
  id: string; code: string; module: string; workSource: EnterpriseWorkSource; workKind: string; nativeRef: string;
  data: RecordData; updatedAt?: string; createdAt?: string; completedAt?: string;
};
export const enterpriseWorkKinds: Record<string, { module: string; tab: string; tr: string; en: string }> = {
  'continuity-plan': { module: 'İş Sürekliliği', tab: 'plans', tr: 'Süreklilik planı', en: 'Continuity plan' },
  'continuity-exercise': { module: 'İş Sürekliliği', tab: 'exercises', tr: 'Süreklilik tatbikatı', en: 'Continuity exercise' },
  'continuity-gap': { module: 'İş Sürekliliği', tab: 'gaps', tr: 'İyileştirme açığı', en: 'Improvement gap' },
  'audit-milestone': { module: 'Denetim Yönetimi', tab: 'plan', tr: 'Denetim görevi', en: 'Audit milestone' },
  'audit-workpaper': { module: 'Denetim Yönetimi', tab: 'workpapers', tr: 'Çalışma kâğıdı', en: 'Audit workpaper' },
  'audit-closure': { module: 'Denetim Yönetimi', tab: 'closure', tr: 'Denetim kapanış onayı', en: 'Audit closure approval' },
  'audit-request': { module: 'Denetim Yönetimi', tab: 'requests', tr: 'Denetim talebi', en: 'Audit request' },
  'policy-review': { module: 'Politika Merkezi', tab: 'policies', tr: 'Politika incelemesi', en: 'Policy review' },
  'policy-version': { module: 'Politika Merkezi', tab: 'versions', tr: 'Sürüm ve yayın', en: 'Version and release' },
  'policy-attestation': { module: 'Politika Merkezi', tab: 'attestations', tr: 'Politika kabulü', en: 'Policy attestation' },
  'policy-exception': { module: 'Politika Merkezi', tab: 'exceptions', tr: 'Politika istisnası', en: 'Policy exception' },
  'vendor-review': { module: 'Tedarikçiler', tab: 'vendors', tr: 'Tedarikçi incelemesi', en: 'Vendor review' },
  'vendor-assessment': { module: 'Tedarikçiler', tab: 'assessments', tr: 'Tedarikçi değerlendirmesi', en: 'Vendor assessment' },
  'vendor-finding': { module: 'Tedarikçiler', tab: 'findings', tr: 'Tedarikçi bulgusu', en: 'Vendor finding' },
  'regulatory-change': { module: 'Regülasyon Merkezi', tab: 'changes', tr: 'Regülasyon incelemesi', en: 'Regulatory review' },
  'regulatory-impact': { module: 'Regülasyon Merkezi', tab: 'impacts', tr: 'Regülasyon aksiyonu', en: 'Regulatory action' },
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): value is RecordData => !!value && typeof value === 'object' && !Array.isArray(value);
const limits: Record<EnterpriseWorkSource, Record<string, number>> = {
  policy: { documents: 1000, versions: 3000, campaigns: 1000, attestations: 5000, exceptions: 2000 },
  vendor: { profiles: 1000, assessments: 2000, findings: 3000 },
  regulatory: { changes: 1000, impacts: 2000 },
  continuity: { plans: 2000, exercises: 2000, gaps: 2000 },
  audit: { requests: 1000 },
};

/** Read-only projection: no synthesized approvals, timestamps or second mutation path. */
export function projectEnterpriseWork(source: EnterpriseWorkSource, payload: unknown): { rows: EnterpriseWorkRow[]; complete: boolean } {
  if (!object(payload)) return { rows: [], complete: false };
  let complete = true;
  const collections: Record<string, RecordData[]> = {};
  for (const [key, limit] of Object.entries(limits[source])) {
    const raw = payload[key];
    const idKey = key === 'profiles' ? 'vendorId' : 'id';
    if (!Array.isArray(raw)) { complete = false; collections[key] = []; continue; }
    const valid = raw.filter((item): item is RecordData => object(item) && !!text(item[idKey]) && !!text(item.status));
    if ((source === 'continuity' ? raw.length > limit : raw.length >= limit) || valid.length !== raw.length || new Set(valid.map(item => text(item[idKey]))).size !== valid.length) complete = false;
    const counts = new Map<string, number>();
    for (const item of valid) counts.set(text(item[idKey]), (counts.get(text(item[idKey])) || 0) + 1);
    collections[key] = valid.filter(item => counts.get(text(item[idKey])) === 1);
  }
  const rows: EnterpriseWorkRow[] = [];
  const add = (kind: string, item: RecordData, data: RecordData, closed: boolean) => {
    const id = text(kind === 'vendor-review' ? item.vendorId : item.id);
    rows.push({ id: `work:${source}:${kind}:${id}`, code: text(data.code) || id, module: enterpriseWorkKinds[kind].module,
      workSource: source, workKind: kind, nativeRef: id, data: { ...data, status: text(item.status), workClosed: closed },
      updatedAt: text(item.updatedAt || item.attestedAt), createdAt: text(item.createdAt || item.detectedAt),
      ...(source === 'continuity' ? { completedAt: text(item.completedAt) } : {}) });
  };
  const parent = (items: RecordData[], field: string, value: unknown) => {
    const found = items.filter(item => text(item[field]) === text(value));
    if (found.length !== 1) complete = false;
    return found.length === 1 ? found[0] : undefined;
  };
  if (source === 'audit') {
    if (payload.complete !== true) complete = false;
    if (payload.closures !== undefined) {
      if (!Array.isArray(payload.closures) || payload.closures.length > 1000) complete = false;
      else {
        const seen = new Set<string>();
        for (const item of payload.closures) {
          if (!object(item) || !text(item.id) || seen.has(text(item.id)) || !text(item.auditId) || !text(item.owner) || !text(item.reviewer) || item.status !== 'submitted') { complete = false; continue; }
          seen.add(text(item.id));
          add('audit-closure', item, { title: item.title, auditId: item.auditId, owner: item.owner, reviewer: item.reviewer }, false);
        }
      }
    }
    if (payload.milestones !== undefined) {
      if (!Array.isArray(payload.milestones) || payload.milestones.length > 1000) complete = false;
      else {
        const counts=new Map<string,number>();
        for(const item of payload.milestones)if(object(item))counts.set(text(item.id),(counts.get(text(item.id))||0)+1);
        for(const item of payload.milestones){
          if(!object(item)||!text(item.id)||counts.get(text(item.id))!==1||!text(item.auditId)||!text(item.title)||!text(item.owner)||!text(item.dueAt)||!Number.isFinite(Date.parse(text(item.dueAt)))||!['planned','in_progress','submitted','changes_requested','completed','cancelled'].includes(text(item.status))){complete=false;continue;}
          if(item.blockedCount!==undefined&&(!Number.isInteger(item.blockedCount)||Number(item.blockedCount)<0||Number(item.blockedCount)>20)){complete=false;continue;}
          if(item.status==='submitted'&&(!text(item.reviewer)||text(item.reviewer)===text(item.owner))){complete=false;continue;}
          add('audit-milestone',item,{title:item.title,auditId:item.auditId,owner:item.owner,reviewer:item.status==='submitted'?item.reviewer:'',dueDate:item.dueAt,blockedCount:item.blockedCount||0},['completed','cancelled'].includes(text(item.status)));
        }
      }
    }
    if (payload.workpapers !== undefined) {
      if (!Array.isArray(payload.workpapers) || payload.workpapers.length > 1000) complete = false;
      else {
        const counts = new Map<string, number>();
        for (const item of payload.workpapers) if (object(item)) counts.set(text(item.id), (counts.get(text(item.id)) || 0) + 1);
        for (const item of payload.workpapers) {
          if (!object(item) || !text(item.id) || counts.get(text(item.id)) !== 1 || !text(item.auditId) || !text(item.title) || !text(item.owner) || !text(item.reviewer) || !['draft', 'submitted', 'approved', 'cancelled'].includes(text(item.status))) { complete = false; continue; }
          if (item.dueAt !== undefined && (typeof item.dueAt !== 'string' || (item.dueAt && !Number.isFinite(Date.parse(item.dueAt))))) { complete = false; continue; }
          add('audit-workpaper', item, { ...(text(item.dueAt) && ['draft', 'submitted'].includes(text(item.status)) ? { dueDate: item.dueAt } : {}), title: item.title, auditId: item.auditId, owner: item.owner, reviewer: item.status === 'submitted' ? item.reviewer : '' }, ['approved', 'cancelled'].includes(text(item.status)));
        }
      }
    }
    for (const item of collections.requests) {
      if (!text(item.auditId) || !text(item.owner) || !text(item.reviewer) || !text(item.dueDate) || !text(item.reviewDueDate) || !['assigned', 'submitted', 'changes_requested', 'accepted', 'cancelled'].includes(text(item.status))) { complete = false; continue; }
      add('audit-request', item, { title: item.title, auditId: item.auditId, owner: item.owner, reviewer: item.status === 'submitted' ? item.reviewer : '', dueDate: item.dueAt || requestNextDue(item as AuditRequest) }, ['accepted', 'cancelled'].includes(text(item.status)));
    }
  } else if (source === 'policy') {
    const { documents, versions, campaigns, attestations, exceptions } = collections;
    for (const p of documents) {
      // Review dates belong to the published document; drafting/release tasks belong to versions.
      if (p.status === 'published' || p.status === 'retired' || !versions.some(v => v.policyId === p.id))
        add('policy-review', p, { title: p.title, code: p.code, owner: p.owner, reviewer: p.reviewer, dueDate: p.nextReview }, p.status === 'retired');
    }
    for (const v of versions) {
      const p = parent(documents, 'id', v.policyId); if (!p) continue;
      add('policy-version', v, { title: `${text(p.title)} · v${v.versionNumber}`, code: p.code, owner: p.owner, reviewer: ['review', 'approved'].includes(text(v.status)) ? p.reviewer : '', dueDate: v.effectiveDate },
        ['published', 'superseded', 'retired', 'rejected'].includes(text(v.status)) || p.status === 'retired');
    }
    for (const a of attestations) {
      const c = parent(campaigns, 'id', a.campaignId), p = parent(documents, 'id', a.policyId); if (!c || !p) continue;
      if (c.status !== 'open' || p.status === 'retired') continue;
      add('policy-attestation', a, { title: a.policyTitle, code: a.policyCode, owner: a.subjectEmail, dueDate: a.dueDate }, ['attested', 'declined'].includes(text(a.status)));
    }
    for (const e of exceptions) {
      const p = parent(documents, 'id', e.policyId); if (!p) continue;
      add('policy-exception', e, { title: `${text(p.title)} · ${text(e.scope)}`, code: p.code, owner: e.owner, reviewer: e.status === 'submitted' ? e.reviewer : '', dueDate: e.expiresAt }, ['closed', 'rejected'].includes(text(e.status)) || p.status === 'retired');
    }
  } else if (source === 'vendor') {
    const { profiles, assessments, findings } = collections;
    for (const p of profiles) add('vendor-review', p, { title: p.name, owner: p.riskOwner, actionOwner: p.businessOwner, dueDate: p.nextReview, criticality: p.criticality }, ['offboarded', 'rejected'].includes(text(p.status)));
    for (const a of assessments) {
      const p = parent(profiles, 'vendorId', a.vendorId); if (!p) continue;
      add('vendor-assessment', a, { title: `${text(p.name)} · ${a.cycleNumber}`, owner: p.riskOwner, actionOwner: p.businessOwner, reviewer: a.status === 'submitted' ? p.reviewer : '', severity: a.riskTier }, ['approved', 'conditional', 'rejected', 'superseded'].includes(text(a.status)) || p.status === 'offboarded');
    }
    for (const f of findings) {
      const p = parent(profiles, 'vendorId', f.vendorId); if (!p) continue;
      add('vendor-finding', f, { title: f.title, owner: f.owner, reviewer: f.status === 'verification' ? p.reviewer : '', dueDate: f.dueDate, severity: f.severity }, f.status === 'closed');
    }
  } else if (source === 'continuity') {
    if (payload.complete !== true) complete = false;
    const date = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) && Number.isFinite(Date.parse(text(value))) && new Date(text(value)).toISOString().slice(0, 10) === value;
    const email = (value: unknown) => /^[^\s@;,|<>]+@[^\s@;,|<>]+\.[^\s@;,|<>]+$/.test(text(value));
    const terminalTime = (item: RecordData) => {
      if (item.completedAt == null || item.completedAt === '') return true; // Legacy records have no fabricated completion.
      return /^\d{4}-\d{2}-\d{2}T/.test(text(item.completedAt)) && Number.isFinite(Date.parse(text(item.completedAt)));
    };
    const valid = (item: RecordData, states: string[], fields: string[], dueField: string) => {
      const ok = states.includes(text(item.status)) && fields.every(field => email(item[field])) && date(item[dueField]) && terminalTime(item);
      if (!ok) complete = false;
      return ok;
    };
    const plans = collections.plans.filter(p => valid(p, ['draft', 'approved', 'active', 'retired'], ['owner', 'reviewer', 'crisisLead'], 'reviewDate') && !!text(p.name) && new Set([p.owner, p.reviewer, p.crisisLead].map(value => text(value).toLowerCase())).size === 3);
    if (plans.length !== collections.plans.length) complete = false;
    const exercises = collections.exercises.filter(e => valid(e, ['planned', 'completed', 'cancelled'], ['facilitator'], 'scheduledDate'));
    for (const p of plans) add('continuity-plan', p, { title: p.name, code: p.code, owner: p.owner, actionOwner: p.crisisLead,
      reviewer: ['draft', 'active'].includes(String(p.status)) ? p.reviewer : '', workWaitingForReview: p.status === 'draft',
      dueDate: p.status === 'active' ? p.reviewDate : '', criticality: p.criticality }, p.status === 'retired');
    for (const e of exercises) {
      const p = parent(plans, 'id', e.planId); if (!p) continue;
      add('continuity-exercise', e, { title: `${text(p.name)} · ${text(e.code) || text(e.id)}`, code: e.code,
        owner: e.facilitator, dueDate: e.scheduledDate, criticality: p.criticality }, e.status !== 'planned');
    }
    for (const g of collections.gaps) {
      if (!valid(g, ['open', 'closed'], ['owner', 'reviewer'], 'dueDate') || !text(g.title) || text(g.owner).toLowerCase() === text(g.reviewer).toLowerCase()) { complete = false; continue; }
      const p = parent(plans, 'id', g.planId), e = parent(exercises, 'id', g.exerciseId);
      if (!p || !e) continue;
      if (e.planId !== p.id || e.status !== 'completed') { complete = false; continue; }
      // No submission state exists: owner and independent reviewer share the open responsibility.
      add('continuity-gap', g, { title: g.title, owner: g.owner, reviewer: g.reviewer, dueDate: g.dueDate, severity: g.severity }, g.status === 'closed');
    }
  } else {
    const { changes, impacts } = collections;
    for (const c of changes) add('regulatory-change', c, { title: c.title, owner: c.owner, reviewer: c.reviewer, dueDate: c.effectiveDate, severity: c.severity }, ['closed', 'not-applicable'].includes(text(c.status)));
    for (const i of impacts) {
      const c = parent(changes, 'id', i.changeId); if (!c) continue;
      add('regulatory-impact', i, { title: i.requiredAction || i.targetTitle, owner: i.actionOwner, reviewer: i.status === 'verification' ? c.reviewer : '', dueDate: i.dueDate, severity: i.impactLevel }, i.status === 'completed');
    }
  }
  return { rows, complete };
}
