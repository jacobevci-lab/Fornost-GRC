import { connectedTitle, type ConnectedGrcRow as Row, type ConnectedGrcLink as Link, type ConnectedGrcCoverageGap, type UnresolvedGrcReference } from './connected-grc-model';

export type ReachableRecord = { row: Row; path: Link[]; via: string[]; depth: number };
/** Traverses visible, resolved relationships only. Reachability is not causal impact. */
export function connectedNeighborhood(root: Row, links: Link[], depth = 1, limit = 30) {
  const adjacency = new Map<string, { row: Row; link: Link }[]>();
  for (const link of links) for (const [from, row] of [[link.source.id, link.target], [link.target.id, link.source]] as const) {
    const bucket = adjacency.get(from) || []; bucket.push({ row, link }); adjacency.set(from, bucket);
  }
  const found = new Map<string, ReachableRecord>([[root.id, { row: root, path: [], via: [root.id], depth: 0 }]]);
  const queue = [found.get(root.id)!]; let truncated = false;
  const maxDepth = Math.max(1, Math.min(3, Math.floor(depth) || 1)), cap = Math.max(2, Math.min(100, Math.floor(limit) || 30));
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]; if (current.depth >= maxDepth) continue;
    const choices = [...(adjacency.get(current.row.id) || [])].sort((a, b) => a.row.id.localeCompare(b.row.id) || a.link.field.localeCompare(b.link.field));
    for (const { row, link } of choices) {
      if (found.has(row.id)) continue;
      if (found.size >= cap) { truncated = true; continue; }
      const next = { row, path: [...current.path, link], via: [...current.via, row.id], depth: current.depth + 1 };
      found.set(row.id, next); queue.push(next);
    }
  }
  return { records: queue.slice(1), links: links.filter(link => found.has(link.source.id) && found.has(link.target.id)).sort((a, b) => `${a.source.id}:${a.target.id}:${a.field}`.localeCompare(`${b.source.id}:${b.target.id}:${b.field}`)), truncated };
}

export type WorkbenchIssue = { id: string; row: Row; kind: 'gap' | 'missing' | 'ambiguous' | 'expired' | 'review' | 'plan'; severity: 'high' | 'medium'; relations: string[]; field?: string; detail?: string; candidates?: Row[]; due?: string };
export function connectedIssues(rows: Row[], links: Link[], gaps: ConnectedGrcCoverageGap[], unresolved: UnresolvedGrcReference[], today = new Date().toISOString().slice(0, 10)): WorkbenchIssue[] {
  const issues: WorkbenchIssue[] = gaps.map(gap => ({ id: `gap:${gap.row.id}:${gap.rule}`, row: gap.row, kind: 'gap', severity: gap.severity, relations: gap.missingRelations }));
  unresolved.forEach(ref => issues.push({ id: `ref:${ref.source.id}:${ref.field}:${ref.value}`, row: ref.source, kind: ref.reason, severity: 'high', relations: [ref.relation], field: ref.field, detail: ref.value, candidates: ref.candidates }));
  for (const row of rows) {
    const expiry = typeof row.data.expiresAt === 'string' ? row.data.expiresAt : '';
    if (row.module === 'Kanıtlar' && (row.data.status === 'Süresi Doldu' || (/^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry < today)))
      issues.push({ id: `expired:${row.id}`, row, kind: 'expired', severity: 'high', relations: [], due: expiry || undefined });
    const review = typeof row.data.nextReview === 'string' ? row.data.nextReview : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(review) && review < today && !['Kapalı', 'Arşivlendi', 'retired'].includes(String(row.data.status)))
      issues.push({ id: `review:${row.id}`, row, kind: 'review', severity: 'medium', relations: [], due: review });
    if (row.module === 'BIA' && row.data.status !== 'Arşivlendi' && !links.some(link => link.relation === 'continuity-bia' && link.target.id === row.id))
      issues.push({ id: `plan:${row.id}`, row, kind: 'plan', severity: 'high', relations: ['continuity-bia'] });
  }
  return issues.sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high') || (a.due || '9999').localeCompare(b.due || '9999') || a.id.localeCompare(b.id));
}
export const issueLabels = {
  gap: ['Eksik bağlantı', 'Missing connection'], missing: ['Referans çözümlenemedi', 'Unresolved reference'], ambiguous: ['Birden fazla hedef', 'Ambiguous target'],
  expired: ['Kanıtın süresi geçti', 'Evidence expired'], review: ['Gözden geçirme gecikti', 'Review overdue'], plan: ['Süreklilik planı bağlantısı yok', 'No continuity plan linked'],
} as const;
export const recordOwner = (row: Row) => String(row.data.owner || row.data.auditOwner || row.data.assignee || '—');
export const recordMatches = (row: Row, query: string, lang: 'tr' | 'en') => [row.code, row.id, connectedTitle(row), recordOwner(row)].join(' ').toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US').includes(query.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US'));

/** Only these source fields support direct edits; all others retain their native workflow. */
export const editableConnections: Record<string, { field: string; target: string[]; required?: boolean; multiple?: boolean; label: [string, string] }[]> = {
  'Risk Assessment': [
    { field: 'asset', target: ['Varlık Envanteri'], required: true, label: ['Etkilenen varlık', 'Affected asset'] },
    { field: 'processLink', target: ['BIA'], label: ['İş süreci / BIA', 'Business process / BIA'] },
    { field: 'existingControls', target: ['Kontroller'], multiple: true, label: ['Riski azaltan kontrol', 'Mitigating control'] },
  ],
  BIA: [{ field: 'asset', target: ['Varlık Envanteri'], required: true, label: ['Bağımlı varlık', 'Dependent asset'] }],
  'Varlık Envanteri': [{ field: 'vendor', target: ['Tedarikçiler'], label: ['Tedarikçi', 'Vendor'] }],
  Kontroller: [{ field: 'processLink', target: ['BIA'], label: ['İş süreci / BIA', 'Business process / BIA'] }],
  Kanıtlar: [{ field: 'controlRefs', target: ['Kontroller'], multiple: true, required: true, label: ['Kanıtlanan kontrol', 'Evidenced control'] }],
  'Denetim Yönetimi': [
    { field: 'riskRef', target: ['Risk Assessment'], label: ['İlgili risk', 'Related risk'] },
    { field: 'evidenceRef', target: ['Kanıtlar'], label: ['İlgili kanıt', 'Related evidence'] },
    { field: 'requirementRef', target: ['Kontroller', 'Uyum'], required: true, label: ['İncelenen kontrol', 'Reviewed control'] },
  ],
};
export const connectionValues = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(connectionValues) : typeof value === 'string' ? value.split(/[;,|\n]+/).map(x => x.trim()).filter(Boolean) : [];

export function changeConnectionData(row: Row, field: string, target: Row, action: 'link' | 'unlink') {
  const rule = editableConnections[row.module]?.find(item => item.field === field);
  if (!rule || !rule.target.includes(target.module) || row.id === target.id || row.id.startsWith('enterprise:') || target.id.startsWith('enterprise:')) throw new Error('unsupported');
  const previous = connectionValues(row.data[field]);
  // Match the exact resolved target, including legacy references, never unrelated text.
  const names = new Set([target.id, target.code].filter(Boolean).map(v => String(v).normalize('NFKC').trim().toLocaleLowerCase('tr-TR')));
  const kept = previous.filter(value => !names.has(value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR')));
  if (action === 'unlink' && kept.length === previous.length) throw new Error('not-linked');
  const next = action === 'link' ? rule.multiple ? [...kept, target.id] : [target.id] : kept;
  if (rule.required && !next.length) throw new Error('required');
  const data = { ...row.data, [field]: rule.multiple && field === 'controlRefs' ? next : next.join('; ') };
  if (row.module === 'Kanıtlar') data.controlRef = next[0] || '';
  return data;
}
