/** Client-safe file policy shared by the initial upload and version form. */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_FILE_TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', log: 'text/plain', json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
export const EVIDENCE_FILE_ACCEPT = Object.keys(EVIDENCE_FILE_TYPES).map(ext => `.${ext}`).join(',');
export const EVIDENCE_FILE_HELP = {
  tr: 'PDF, PNG/JPG/WebP, CSV/TSV, TXT/LOG, JSON, DOCX ve XLSX · en fazla 10 MB. Metin dosyaları UTF-8 olmalı. Office dosyaları şifresiz ve makrosuz olmalı; gömülü ikili nesneler desteklenmez.',
  en: 'PDF, PNG/JPG/WebP, CSV/TSV, TXT/LOG, JSON, DOCX and XLSX · up to 10 MB. Text files must use UTF-8. Office files must be unencrypted and macro-free; embedded binary objects are not supported.',
};
export const evidenceInlineType = (type: string) => ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(type);
export const EVIDENCE_METADATA_FIELDS = ['evidenceTitle', 'controlRef', 'controlRefs', 'controlTitle', 'owner', 'period', 'frameworks', 'sourceSystem', 'collectedAt', 'expiresAt', 'reviewer', 'reviewStatus', 'notes'] as const;
