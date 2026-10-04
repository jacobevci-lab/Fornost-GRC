export const enterpriseWorkSources = [
  { key: 'policy', path: '/api/policy-lifecycle' },
  { key: 'vendor', path: '/api/third-party-risk' },
  { key: 'regulatory', path: '/api/regulatory-intelligence' },
] as const;
export type EnterpriseWorkSource = typeof enterpriseWorkSources[number]['key'];
type RecordData = Record<string, unknown>;
export type EnterpriseWorkRow = {
  id: string; code: string; module: string; workSource: EnterpriseWorkSource; workKind: string; nativeRef: string;
  data: RecordData; updatedAt?: string; createdAt?: string;
};
export const enterpriseWorkKinds: Record<string, { module: string; tab: string; tr: string; en: string }> = {
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
    if (raw.length >= limit || valid.length !== raw.length || new Set(valid.map(item => text(item[idKey]))).size !== valid.length) complete = false;
    const counts = new Map<string, number>();
    for (const item of valid) counts.set(text(item[idKey]), (counts.get(text(item[idKey])) || 0) + 1);
    collections[key] = valid.filter(item => counts.get(text(item[idKey])) === 1);
  }
  const rows: EnterpriseWorkRow[] = [];
  const add = (kind: string, item: RecordData, data: RecordData, closed: boolean) => {
    const id = text(kind === 'vendor-review' ? item.vendorId : item.id);
    rows.push({ id: `work:${source}:${kind}:${id}`, code: text(data.code) || id, module: enterpriseWorkKinds[kind].module,
      workSource: source, workKind: kind, nativeRef: id, data: { ...data, status: text(item.status), workClosed: closed },
      updatedAt: text(item.updatedAt || item.attestedAt), createdAt: text(item.createdAt || item.detectedAt) });
  };
  const parent = (items: RecordData[], field: string, value: unknown) => {
    const found = items.filter(item => text(item[field]) === text(value));
    if (found.length !== 1) complete = false;
    return found.length === 1 ? found[0] : undefined;
  };
  if (source === 'policy') {
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
