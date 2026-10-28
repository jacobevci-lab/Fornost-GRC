export const vendorWorkLabels: Record<string, { tr: string; en: string }> = {
  onboarding: { tr: 'Kabul değerlendirmesi', en: 'Onboarding' }, reassessment: { tr: 'Yeniden değerlendirme', en: 'Reassessment' },
  'in-review': { tr: 'İncelemede', en: 'In review' }, approved: { tr: 'Onaylandı', en: 'Approved' },
  conditional: { tr: 'Koşullu onaylandı', en: 'Conditionally approved' }, rejected: { tr: 'Reddedildi', en: 'Rejected' },
  offboarded: { tr: 'İlişki kapatıldı', en: 'Offboarded' }, draft: { tr: 'Taslak', en: 'Draft' },
  submitted: { tr: 'İncelemeye sunuldu', en: 'Submitted for review' }, superseded: { tr: 'Önceki dönem', en: 'Previous cycle' },
  open: { tr: 'Açık', en: 'Open' }, 'in-progress': { tr: 'İşlemde', en: 'In progress' },
  verification: { tr: 'Doğrulamada', en: 'In verification' }, closed: { tr: 'Kapatıldı', en: 'Closed' },
};
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const email = (value: unknown) => /^[^\s@;,|<>]+@[^\s@;,|<>]+\.[^\s@;,|<>]+$/.test(text(value));
const date = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) && Number.isFinite(Date.parse(text(value))) && new Date(text(value)).toISOString().slice(0, 10) === text(value);
const timestamp = (value: unknown) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text(value)) && Number.isFinite(Date.parse(text(value))) && new Date(text(value)).toISOString().slice(0, 10) === text(value).slice(0, 10);
export function validVendorWork(item: Row, kind: 'profile' | 'assessment' | 'finding') {
  const status = text(item.status), terminal = kind === 'profile' ? ['offboarded','rejected'].includes(status) : kind === 'assessment' ? ['approved','conditional','rejected','superseded'].includes(status) : status === 'closed';
  if (!timestamp(item.createdAt) || !timestamp(item.updatedAt) || (item.completedAt != null && item.completedAt !== '' && (!terminal || !timestamp(item.completedAt)))) return false;
  if (kind === 'profile') return !!text(item.name) && ['onboarding','reassessment','in-review','approved','conditional','rejected','offboarded'].includes(status)
    && ['low','medium','high','critical'].includes(text(item.criticality)) && [item.businessOwner,item.riskOwner,item.reviewer].every(email)
    && new Set([item.businessOwner,item.riskOwner,item.reviewer].map(x => text(x).toLowerCase())).size === 3
    && date(item.nextReview) && date(item.contractEnd) && text(item.nextReview) <= text(item.contractEnd);
  if ((kind === 'assessment' && item.decidedBy != null && item.decidedBy !== '' && !email(item.decidedBy)) || (kind === 'finding' && item.verifiedBy != null && item.verifiedBy !== '' && !email(item.verifiedBy))) return false;
  if (kind === 'assessment') return !!text(item.vendorId) && ['draft','submitted','approved','conditional','rejected','superseded'].includes(status)
    && ['low','medium','high','critical'].includes(text(item.riskTier)) && Number.isInteger(item.cycleNumber) && Number(item.cycleNumber) > 0;
  return !!text(item.vendorId) && !!text(item.assessmentId) && !!text(item.title) && ['open','in-progress','verification','closed'].includes(status)
    && ['low','medium','high','critical'].includes(text(item.severity)) && email(item.owner) && date(item.dueDate);
}
