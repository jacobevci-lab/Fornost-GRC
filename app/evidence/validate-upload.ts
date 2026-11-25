import { EVIDENCE_FILE_TYPES, EVIDENCE_MAX_BYTES } from './file-types';
import { validateEvidenceFile } from './versioning';
import { validateOfficeContainer } from './office-container';

export class EvidenceFileError extends Error {
  constructor(public code: 'size' | 'type' | 'content' | 'text' | 'json' | 'office') { super(code); }
}
export const evidenceFileErrorMessage = (error: unknown) => {
  const code = error instanceof EvidenceFileError ? error.code : 'content';
  return {
    size: 'Dosya 1 byte ile 10 MB arasında olmalı. / File must be between 1 byte and 10 MB.',
    type: 'Dosya uzantısı veya bildirilen tür desteklenmiyor. / Unsupported file extension or declared type.',
    content: 'Dosya içeriği türüyle eşleşmiyor. / File content does not match its type.',
    text: 'Metin dosyası UTF-8 olmalı ve ikili kontrol karakterleri içermemeli. / Text must be UTF-8 without binary control characters.',
    json: 'Geçerli bir JSON dosyası seçin. / Choose a valid JSON file.',
    office: 'Office paketi doğrulanamadı: geçerli, şifresiz ve makrosuz DOCX/XLSX gerekir. Gömülü ikili nesneler veya aşırı büyük/sıkıştırılmış paketler desteklenmez. / Office package validation failed: use valid, unencrypted, macro-free DOCX/XLSX without embedded binary objects or oversized/high-compression content.',
  }[code];
};

/** Returns an authoritative MIME value; browser MIME and filename alone are never sufficient. */
export function validateEvidenceUpload(bytes: Uint8Array, fileName: string, declaredType: string) {
  if (!bytes.length || bytes.length > EVIDENCE_MAX_BYTES) throw new EvidenceFileError('size');
  const extension = fileName.split('.').pop()?.toLowerCase() as keyof typeof EVIDENCE_FILE_TYPES;
  if (!fileName.includes('.') || !Object.hasOwn(EVIDENCE_FILE_TYPES, extension)) throw new EvidenceFileError('type');
  const type = EVIDENCE_FILE_TYPES[extension], declared = declaredType.toLowerCase().split(';')[0].trim();
  const isText = ['csv', 'tsv', 'txt', 'log', 'json'].includes(extension), office = extension === 'docx' || extension === 'xlsx';
  const accepted = ['', 'application/octet-stream', type];
  if (isText) accepted.push('text/plain');
  if (extension === 'csv') accepted.push('application/csv', 'application/vnd.ms-excel');
  if (extension === 'json') accepted.push('text/json');
  if (office) accepted.push('application/zip', 'application/x-zip-compressed');
  if (!accepted.includes(declared)) throw new EvidenceFileError('type');
  if (office) {
    try { validateOfficeContainer(bytes, extension); } catch { throw new EvidenceFileError('office'); }
  } else if (isText) {
    let source: string;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new EvidenceFileError('text'); }
    if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(source)) throw new EvidenceFileError('text');
    if (extension === 'json') { try { JSON.parse(source); } catch { throw new EvidenceFileError('json'); } }
  } else if (!validateEvidenceFile(bytes, type)) throw new EvidenceFileError('content');
  return type;
}
