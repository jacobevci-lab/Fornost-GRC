import { assessedRiskScore } from './risk-methodology';

export type ViewSort = { key: string; direction: 'asc' | 'desc' };
type SortOption = { key: string; tr: string; en: string; kind: 'text' | 'number' | 'date' };
const option = (key: string, tr: string, en: string, kind: SortOption['kind'] = 'text'): SortOption => ({ key, tr, en, kind });
const title = option('title', 'Başlık', 'Title'), owner = option('owner', 'Sorumlu', 'Owner');
const updated = option('updatedAt', 'Son güncelleme', 'Last updated', 'date');
const extra: Record<string, SortOption[]> = {
  'Risk Assessment': [option('inherentRisk', 'Doğal risk puanı', 'Inherent risk score', 'number'), option('targetDate', 'Hedef tarih', 'Target date', 'date'), option('nextReview', 'Sonraki inceleme', 'Next review', 'date')],
  BIA: [option('rto', 'RTO (saat)', 'RTO (hours)', 'number'), option('rpo', 'RPO (saat)', 'RPO (hours)', 'number'), option('nextTestDate', 'Sonraki test', 'Next test', 'date')],
  'Varlık Envanteri': [option('eolDate', 'Destek sonu', 'End of support', 'date'), option('nextReview', 'Sonraki inceleme', 'Next review', 'date')],
  Uyum: [option('dueDate', 'Termin', 'Due date', 'date'), option('nextAssessment', 'Sonraki değerlendirme', 'Next assessment', 'date')],
  Kontroller: [option('nextTestDate', 'Sonraki test', 'Next test', 'date')],
  Kanıtlar: [option('expiresAt', 'Geçerlilik sonu', 'Expiry date', 'date'), option('collectedAt', 'Toplanma tarihi', 'Collection date', 'date')],
  'Denetim Yönetimi': [option('dueDate', 'Termin', 'Due date', 'date'), option('progress', 'İlerleme', 'Progress', 'number')],
};
export function viewSortOptions(module: string): SortOption[] {
  if (module === 'My Work') return [option('priority', 'Öncelik grubu', 'Priority group', 'number'), option('due', 'Termin', 'Due date', 'date'), title, owner, updated];
  return Object.hasOwn(extra, module) ? [title, ...extra[module], owner, updated, option('createdAt', 'Oluşturulma tarihi', 'Created', 'date')] : [];
}
export function validateViewSort(value: unknown): ViewSort | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
  const v = value as ViewSort;
  if (Object.keys(v).sort().join(',') !== 'direction,key' || typeof v.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(v.key) || !['asc', 'desc'].includes(v.direction)) throw new Error('invalid');
  return { key: v.key, direction: v.direction };
}
export function viewSortLabel(module: string, sort: ViewSort | undefined, lang: string) {
  const tr = lang === 'tr', item = viewSortOptions(module).find(item => item.key === sort?.key);
  if (!item || !sort) return tr ? 'Varsayılan sıralama' : 'Default order';
  return `${tr ? item.tr : item.en} · ${sort.direction === 'asc' ? (tr ? 'Artan' : 'Ascending') : (tr ? 'Azalan' : 'Descending')}`;
}
export function sortValue(value: unknown, kind: SortOption['kind']): string | number | null {
  if (value === null || value === undefined || (typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  if (kind === 'text') return String(value).trim();
  if (kind === 'number') { const n = Number(value); return Number.isFinite(n) ? n : null; }
  const text = String(value), n = Date.parse(text);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) || !Number.isFinite(n)) return null;
  // Date.parse normalizes impossible dates such as February 31; do not rank them as verified dates.
  const day = text.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return null;
  return n;
}
/** Empty values stay last for either direction; IDs settle ties without mutating the source. */
export function sortViewItems<T>(rows: T[], sort: ViewSort | undefined, lang: string, value: (row: T) => string | number | null, identity: (row: T) => string): T[] {
  if (!sort) return rows;
  const collator = new Intl.Collator(lang === 'tr' ? 'tr' : 'en', { numeric: true, sensitivity: 'base' });
  return rows.map(row => ({ row, value: value(row), id: identity(row) })).sort((a, b) => {
    if (a.value === null || b.value === null) return a.value === b.value ? a.id.localeCompare(b.id) : a.value === null ? 1 : -1;
    const comparison = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : collator.compare(String(a.value), String(b.value));
    return comparison * (sort.direction === 'desc' ? -1 : 1) || a.id.localeCompare(b.id);
  }).map(item => item.row);
}
type Row = { id: string; data: Record<string, unknown>; createdAt?: string; updatedAt?: string };
export function sortRegisterRows<T extends Row>(rows: T[], module: string, sort: ViewSort | undefined, lang: string): T[] {
  const item = viewSortOptions(module).find(item => item.key === sort?.key);
  if (!item || !sort) return rows;
  return sortViewItems(rows, sort, lang, row => {
    const d = row.data;
    if (sort.key === 'inherentRisk') return sortValue(assessedRiskScore(d), 'number');
    if (sort.key === 'title') return sortValue(d.title || d.process || d.evidenceTitle || d.requirementTitle || d.controlTitle, 'text');
    return sortValue(sort.key === 'createdAt' || sort.key === 'updatedAt' ? row[sort.key] : d[sort.key], item.kind);
  }, row => row.id);
}
