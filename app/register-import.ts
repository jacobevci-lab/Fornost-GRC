import { validate, validModule } from './core-record-validation';
import { preserveRiskGovernance } from './risk-governance-write';

export type ImportIssue = { row?: number; field?: string; code: string; detail?: string };
export class RegisterImportError extends Error {
  constructor(public code: string, public issues: ImportIssue[] = [], public status = 400) { super(code); }
}
export type ImportSheet = { columns: { index: number; label: string }[]; rows: { number: number; values: string[] }[]; blankRows: number };
const populated = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';
function cell(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new RegisterImportError('cell-type');
    return value.toISOString().slice(0, 10);
  }
  if (!populated(value)) return '';
  if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new RegisterImportError('cell-type');
  return String(value);
}
/** Retain physical indices: removing a blank header must never move a value into another field. */
export function parseImportSheet(sheet: unknown[][]): ImportSheet {
  if (!Array.isArray(sheet) || !sheet.length || sheet.some(row => !Array.isArray(row))) throw new RegisterImportError('empty');
  const width = sheet.reduce((max, row) => Math.max(max, row.reduce<number>((last, value, i) => populated(value) ? i + 1 : last, 0)), 0);
  if (width > 100) throw new RegisterImportError('columns-limit');
  const labels = Array.from({ length: width }, (_, i) => cell(sheet[0][i]).trim());
  const nonempty = sheet.slice(1).map((values, i) => ({ values, number: i + 2 })).filter(row => row.values.some(populated));
  if (nonempty.length > 1000) throw new RegisterImportError('rows-limit');
  if (!nonempty.length) throw new RegisterImportError('empty');
  const seen = new Set<string>();
  labels.forEach((label, index) => {
    if (!label && nonempty.some(row => populated(row.values[index]))) throw new RegisterImportError('unnamed-column', [{ field: String(index + 1), code: 'unnamed-column' }]);
    if (label.length > 200) throw new RegisterImportError('header-length');
    const key = label.normalize('NFKC').toLocaleLowerCase('en-US');
    if (label && seen.has(key)) throw new RegisterImportError('duplicate-header', [{ field: label, code: 'duplicate-header' }]);
    if (label) seen.add(key);
  });
  return { columns: labels.flatMap((label, index) => label ? [{ label, index }] : []), rows: nonempty.map(row => ({ number: row.number, values: Array.from({ length: width }, (_, i) => cell(row.values[i])) })), blankRows: sheet.length - 1 - nonempty.length };
}
export function mappedImport(sheet: ImportSheet, mapping: Record<string, string>, supported: string[]) {
  const columns = sheet.columns.filter(column => !!mapping[column.index]);
  const keys = columns.map(column => mapping[column.index]);
  if (keys.some(key => !supported.includes(key))) throw new RegisterImportError('mapping');
  if (new Set(keys).size !== keys.length) throw new RegisterImportError('duplicate-mapping');
  if (!keys.length) throw new RegisterImportError('mapping');
  const rows: Record<string, unknown>[] = [], sourceRows: number[] = [];
  let excludedRows = 0;
  for (const row of sheet.rows) {
    const record = Object.fromEntries(columns.map(column => [mapping[column.index], row.values[column.index]]));
    if (!Object.values(record).some(populated)) { excludedRows++; continue; }
    rows.push(record); sourceRows.push(row.number);
  }
  if (!rows.length) throw new RegisterImportError('empty');
  return { rows, sourceRows, excludedRows, ignoredColumns: sheet.columns.length - columns.length };
}
/** Strict import validation rejects loss before invoking the canonical record normalizer. */
export function validateImportRows(module: unknown, value: unknown) {
  if (!validModule(module) || !Array.isArray(value) || value.length < 1 || value.length > 1000) throw new RegisterImportError('rows-limit');
  const rows: Record<string, unknown>[] = [], issues: ImportIssue[] = [];
  value.forEach((source: unknown, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) { issues.push({ row: index + 1, code: 'row-type' }); return; }
    const entries = Object.entries(source);
    const invalid = entries.filter(([key, v]) => !/^[a-zA-Z][a-zA-Z0-9]{0,59}$/.test(key) || ['constructor','prototype'].includes(key) || (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) || (typeof v === 'number' && !Number.isFinite(v)));
    if (invalid.length) { issues.push({ row: index + 1, code: 'cell-type', field: invalid[0][0] }); return; }
    const long = entries.find(([key, v]) => typeof v === 'string' && v.length > (module === 'Denetim Yönetimi' && ['requirementStatement', 'requirementGuidance', 'requirementAssessment'].includes(key) ? 100000 : 1000));
    if (long) { issues.push({ row: index + 1, code: 'cell-length', field: long[0] }); return; }
    const result = validate(module, module === 'Risk Assessment' ? preserveRiskGovernance(source as Record<string, unknown>) : source);
    if ('error' in result) issues.push({ row: index + 1, code: 'validation', detail: result.error });
    else rows.push(result.data);
  });
  return { rows, issues };
}

const messages: Record<string, [string, string]> = {
  'file-size': ['Dosya en fazla 5 MB olabilir.', 'The file may not exceed 5 MB.'],
  'file-type': ['Geçerli bir .xlsx dosyası seçin.', 'Select a valid .xlsx workbook.'],
  'file-read': ['Dosya okunamadı. Geçerli bir .xlsx dosyası seçin.', 'The file could not be read. Select a valid .xlsx workbook.'],
  'import-request': ['İçe aktarma işlemi belirsiz veya geçersiz. Yeniden önizleyin.', 'The import operation is ambiguous or invalid. Preview again.'],
  validation: ['Satır hatalarını düzeltin; hiçbir kayıt oluşturulmadı.', 'Correct the row errors; no records were created.'],
  empty: ['İçe aktarılacak dolu satır yok.', 'There are no populated rows to import.'],
  'columns-limit': ['Dosya en fazla 100 sütun içerebilir. Sütunları azaltıp yeniden seçin.', 'The worksheet may contain at most 100 columns. Reduce its columns and select it again.'],
  'rows-limit': ['İçe aktarma 1–1.000 dolu satır olmalı. Dosyayı bölerek yeniden seçin.', 'Import 1–1,000 populated rows. Split the workbook and select it again.'],
  'unnamed-column': ['Veri içeren bir sütunun başlığı boş. Excel’de başlık ekleyin.', 'A populated column has no header. Add its header in Excel.'],
  'duplicate-header': ['Tekrarlanan sütun başlığı var. Excel’de başlıkları benzersiz yapın.', 'A column header is repeated. Make the workbook headers unique.'],
  'header-length': ['Sütun başlığı 200 karakteri aşamaz.', 'A column header may not exceed 200 characters.'],
  'duplicate-mapping': ['Birden fazla sütun aynı alana eşlenmiş. Her alan için tek sütun seçin.', 'Multiple columns target the same field. Select only one column per field.'],
  mapping: ['En az bir desteklenen alanı eşleştirin.', 'Map at least one supported field.'],
  'cell-type': ['Desteklenmeyen hücre veya kayıt türü.', 'Unsupported cell or record type.'],
  'cell-length': ['Metin alan sınırını aşıyor; veri kesilmedi. Excel’de metni kısaltın.', 'Text exceeds the field limit; no data was truncated. Shorten it in Excel.'],
  'row-type': ['Geçersiz kayıt biçimi.', 'Invalid record format.'],
  forbidden: ['Güncel modül yazma yetkisi gerekli. Erişiminizi kontrol edin.', 'Current module write access is required. Check your access.'],
  'import-conflict': ['Bu işlem kimliği farklı içerikle kullanılmış. Yeniden önizleyin.', 'This operation ID was used with different content. Preview a new operation.'],
  'import-token': ['İşlem kimliği geçersiz. Yeniden önizleyin.', 'Invalid operation ID. Preview again.'],
  'import-conflict-live': ['Yetki veya bağlantılar değişmiş olabilir. Önizlemeyi yenileyin.', 'Permissions or references may have changed. Refresh the preview.'],
  'reference-unavailable': ['Bağlantılı kayıt bulunamıyor veya hedef modül yanlış. Kayıt kodlarını kontrol edin.', 'A linked record is missing or belongs to the wrong module. Check record codes.'],
  'audit-closed': ['Denetim kapalı. Yeni madde eklemek için gerekçeyle yeniden açılmalı.', 'The audit is closed. Reopen it with a reason before adding requirements.'],
  'payload-limit': ['İstek 2 MB sınırını aşıyor. Dosyayı daha küçük parçalara bölün.', 'The request exceeds 2 MB. Split the workbook into smaller batches.'],
  unavailable: ['İşlem doğrulanamadı. Veriniz korunuyor; yeniden deneyin.', 'The operation could not be confirmed. Your data is retained; retry.'],
};
export function importIssueText(issue: ImportIssue, lang: string, labels: Record<string, string> = {}) {
  const tr = lang === 'tr';
  if (issue.code !== 'validation') return `${messages[issue.code]?.[tr ? 0 : 1] || messages.unavailable[tr ? 0 : 1]}${issue.field ? ` (${labels[issue.field] || issue.field})` : ''}`;
  const message = issue.detail || '';
  if (tr) return message.replace(/[a-zA-Z][a-zA-Z0-9]+/g, key => labels[key] || key);
  const names = (value: string) => value.split(', ').map(key => labels[key] || key).join(', ');
  if (message.startsWith('Zorunlu alanlar eksik: ')) return `Required fields missing: ${names(message.split(': ')[1])}`;
  if (message.startsWith('Risk değerlendirmesi tamamlanmadan')) return `Complete the risk assessment before selecting this status. Missing: ${names(message.split(': ')[1] || '')}`;
  if (message.startsWith('Geçersiz tarih: ')) return `Invalid calendar date: ${names(message.split(': ')[1])}`;
  if (message.endsWith(' 1-5 arasında olmalıdır.')) return `${names(message.split(' ')[0])} must be an integer from 1 to 5.`;
  const translations: Record<string, string> = { 'Geçersiz operasyon durumu.': 'Invalid operational status. Use a supported stored status value.', 'progress 0-100 arasında olmalıdır.': 'Progress must be an integer from 0 to 100.', 'Geçersiz risk sahibi e-posta adresi.': 'Invalid owner email address.', 'Sonraki değerlendirme tarihi son değerlendirmeden önce olamaz.': 'Next review cannot precede the last review.', 'Denetim bitiş tarihi başlangıç tarihinden önce olamaz.': 'Audit end cannot precede its start.', 'Kayıt verisi izin verilen boyutu aşıyor.': 'Record data exceeds the permitted size.' };
  return translations[message] || 'Invalid record data. Check the mapped fields.';
}
