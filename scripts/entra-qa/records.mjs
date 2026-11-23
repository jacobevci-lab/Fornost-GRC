// Fictional exercise. Nothing here asserts a real Microsoft assurance or incident.
export const title = {
  vendor: 'Microsoft Corporation (Entra ID / M365)',
  asset: 'Microsoft Entra ID (Azure AD) Tenant',
  bia: 'Kurumsal Kimlik ve Erişim Yönetimi (IAM / SSO)',
  plan: 'Entra ID Break-Glass ve Kimlik Kurtarma Planı',
  control: 'Entra ID Global Admin Hesaplarında Phishing-Resistant MFA (FIDO2) ve PIM Zorunluluğu',
  evidence: 'Entra ID Conditional Access ve PIM Politika Çıktısı',
  policy: 'Ayrıcalıklı Erişim ve Kimlik Yönetimi Politikası',
  risk: 'Entra ID Global Admin Hesap Ele Geçirme ve Yetki Yükseltme Riski',
  kri: 'PIM veya FIDO2 MFA Koruması Olmayan Global Admin Hesap Sayısı',
  ai: 'Microsoft Security Copilot — Entra ID Kimlik Analiz Asistanı',
  incident: 'Entra ID Break-Glass Admin Hesabında Olağandışı Oturum Açma Girişimi',
  finding: '2 Eski Global Admin Hesabında PIM Süre Sınırı Eksikliği',
};
export const note = 'Fornost E2E · Entra IAM · sentetik tatbikat';
export const date = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const sources = [
  ['/api/grc', 'rows'],
  ['/api/third-party-risk', 'profiles'],
  ['/api/third-party-risk', 'assessments'],
  ['/api/third-party-risk', 'findings'],
  ['/api/risk-appetite', 'appetites'],
  ['/api/risk-appetite', 'scenarios'],
  ['/api/risk-appetite', 'measurements'],
  ['/api/risk-appetite', 'breaches'],
  ['/api/continuity', 'plans'],
  ['/api/continuity', 'exercises'],
  ['/api/continuity', 'gaps'],
  ['/api/audits', 'audits'],
  ['/api/findings?view=graph', 'findings'],
  ['/api/incidents', 'incidents'],
  ['/api/policy-lifecycle', 'documents'],
  ['/api/policy-lifecycle', 'versions'],
  ['/api/policy-lifecycle', 'exceptions'],
  ['/api/policy-lifecycle', 'campaigns'],
  ['/api/regulatory-intelligence', 'sources'],
  ['/api/regulatory-intelligence', 'changes'],
  ['/api/regulatory-intelligence', 'impacts'],
  ['/api/ai/workspace', 'systems'],
  ['/api/ai/workspace', 'shadow'],
];
async function collection(api, path) {
  let body = await api(path);
  const all = { ...body },
    seen = new Set(),
    revision = body.revision;
  while (body.nextCursor) {
    const cursor = body.nextCursor;
    if (seen.has(cursor)) throw Error('Repeated cursor for ' + path);
    seen.add(cursor);
    const core = path === '/api/grc',
      query = new URLSearchParams(core ? { cursor } : { after: cursor, revision });
    body = await api(path + (core ? '?' : '&') + query);
    const key = core ? 'rows' : 'findings';
    if (!core && body.revision !== revision) throw Error('Finding register changed during inventory');
    all[key] = all[key].concat(body[key]);
  }
  if (body.complete === false || body.hasMore) throw Error('Incomplete inventory ' + path);
  return all;
}
export async function inventory(api) {
  const pages = new Map(),
    rows = [];
  for (const [path, key] of sources) {
    if (!pages.has(path)) pages.set(path, await collection(api, path));
    const data = pages.get(path);
    if (!Array.isArray(data[key])) throw Error('Missing inventory collection ' + path + ' / ' + key);
    for (const raw of data[key]) {
      const v = raw.data_json ? JSON.parse(raw.data_json) : raw;
      const name =
        v.title ||
        v.name ||
        v.kriName ||
        v.process ||
        v.evidenceTitle ||
        v.controlTitle ||
        v.auditName ||
        v.systemName ||
        v.sourceTitle;
      rows.push({
        key,
        path,
        id: raw.id || raw.vendorId,
        name: name || '',
        module: raw.module,
        creator: v.createdBy || raw.created_by || raw.catalog?.createdBy,
        status: v.status,
        revision: raw.updated_at || v.updatedAt || v.revision,
      });
    }
  }
  return rows;
}
const governed = new Set(['documents', 'appetites', 'profiles', 'findings', 'incidents']);
export async function clean(api, report, apply, owner) {
  const before = await inventory(api);
  const candidates = before.filter((r) => /^QA-CLOUD-|^(?:test|Assessment \d+)$/i.test(r.name));
  report.cleanup = {
    inspected: before.length,
    candidates: candidates.length,
    deleted: [],
    cancelled: [],
    retained: [],
  };
  const log = report.cleanup;
  for (const r of candidates.sort((a, b) => Number(a.key === 'rows') - Number(b.key === 'rows'))) {
    const label = { module: r.module || r.key, title: r.name };
    const owned =
      /^QA-CLOUD-/i.test(r.name) ||
      (r.creator &&
        (r.creator === owner ||
          [
            'qa-admin@fornost.test',
            'entra-qa-reviewer@fornost.test',
            'entra-qa-lead@fornost.test',
          ].includes(r.creator.toLowerCase())));
    if (!apply || !owned || !r.id) {
      log.retained.push({ ...label, reason: apply ? 'ownership uncertain' : 'inventory only' });
      continue;
    }
    if (r.status === 'cancelled' || r.status === 'İptal Edildi') continue;
    const latest = (await collection(api, r.path))[r.key].find((v) => (v.id || v.vendorId) === r.id);
    const current = latest?.data_json ? JSON.parse(latest.data_json) : latest;
    if (!current) {
      continue;
    }
    if (
      !Object.values(current).includes(r.name) ||
      !r.revision ||
      r.revision !== (latest.updated_at || current.updatedAt || current.revision)
    ) {
      log.retained.push({ ...label, reason: 'missing or changed revision' });
      continue;
    }
    let result, action;
    const expected = [200, 409];
    if (r.key === 'rows') {
      const q = new URLSearchParams({ id: r.id, expectedUpdatedAt: r.revision });
      result = await api('/api/grc?' + q, { method: 'DELETE', expected });
      action = 'deleted';
    } else if (governed.has(r.key) && !(r.key === 'findings' && r.path.includes('third-party'))) {
      result = await api(r.path.split('?')[0], {
        method: 'POST',
        expected,
        data: {
          action: 'cancel-record',
          recordId: r.id,
          expectedUpdatedAt: r.revision,
          reason: 'test',
          note: 'QA-CLOUD test fixture cleanup; maintain decision history.',
          confirmation: 'İPTAL ET',
        },
      });
      action = 'cancelled';
    } else if (r.key === 'audits') {
      const q = new URLSearchParams({ id: r.id, expectedUpdatedAt: r.revision });
      result = await api('/api/audits?' + q, { method: 'DELETE', expected });
      action = 'deleted';
    } else if (r.key === 'plans') {
      result = await api('/api/continuity', {
        method: 'POST',
        expected,
        data: {
          action: 'cancel-plan',
          planId: r.id,
          expectedUpdatedAt: r.revision,
          note: 'QA-CLOUD test fixture cleanup; maintain decision history.',
          confirmation: 'PLANI İPTAL ET',
        },
      });
      action = 'cancelled';
    } else if (r.key === 'sources') {
      result = await api(r.path, {
        method: 'POST',
        expected,
        data: { action: 'delete-source', sourceId: r.id, expectedUpdatedAt: r.revision },
      });
      action = 'deleted';
    } else if (r.key === 'systems') {
      result = await api('/api/ai/models', {
        method: 'DELETE',
        expected,
        data: { id: r.id, expectedUpdatedAt: r.revision, confirmation: 'SİL' },
      });
      action = 'deleted';
    } else {
      log.retained.push({
        ...label,
        reason: 'governed lineage; no independent revision-guarded deletion',
      });
      continue;
    }
    if (result.code || result.error) {
      log.retained.push({ ...label, reason: result.code || 'lifecycle guard' });
      continue;
    }
    const after = (await collection(api, r.path))[r.key].find((x) => (x.id || x.vendorId) === r.id);
    if (
      action === 'deleted'
        ? Boolean(after)
        : after && !['cancelled', 'İptal Edildi'].includes(after.status)
    )
      throw Error('Cleanup result did not match the register');
    log[action].push(label);
  }
  return before;
}
