import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { validateEvidenceUpload, EvidenceFileError } from '../app/evidence/validate-upload';
import { EVIDENCE_FILE_TYPES, EVIDENCE_MAX_BYTES, evidenceInlineType } from '../app/evidence/file-types';

const text = (s: string) => new TextEncoder().encode(s);
const ns = 'http://schemas.openxmlformats.org/package/2006/';
async function office(extension: 'docx' | 'xlsx', mutate?: (zip: JSZip) => void, options = {}) {
  const zip = new JSZip(), part = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const content = extension === 'docx' ? 'wordprocessingml.document' : 'spreadsheetml.sheet';
  zip.file('[Content_Types].xml', `<Types xmlns="${ns}content-types"><Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${content}.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="${ns}relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>`);
  zip.file(part, extension === 'docx' ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' : '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>');
  mutate?.(zip);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', ...options });
}
function rejects(bytes: Uint8Array, name: string, code: EvidenceFileError['code'], mime = '') {
  assert.throws(() => validateEvidenceUpload(bytes, name, mime), error => error instanceof EvidenceFileError && error.code === code);
}

test('UTF-8 CSV, TSV, logs, text and JSON preserve content and receive canonical MIME', () => {
  for (const ext of ['csv', 'tsv', 'txt', 'log', 'json'] as const) {
    const bytes = text(ext === 'json' ? '\uFEFF{"kontrol":"erişim","value":0}' : 'kontrol\tdeğer\r\nA.5.18,İncelemede\n=1+1');
    const copy = bytes.slice();
    for (const mime of ['', 'application/octet-stream', 'text/plain', EVIDENCE_FILE_TYPES[ext]]) assert.equal(validateEvidenceUpload(bytes, `Export.${ext.toUpperCase()}`, mime), EVIDENCE_FILE_TYPES[ext]);
    assert.deepEqual(bytes, copy);
  }
});
test('unreadable, binary, malformed, mislabeled and unsupported documents are rejected', () => {
  rejects(Uint8Array.of(0xff, 0xfe, 65), 'file.txt', 'text');
  rejects(text('hello\u0000world'), 'file.csv', 'text');
  rejects(text('{"a":'), 'file.json', 'json');
  for (const name of ['file', 'file.html', 'file.svg', 'file.xls', 'file.docm', 'file.zip']) rejects(text('data'), name, 'type');
  rejects(text('data'), 'file.csv', 'type', 'text/html');
  rejects(text('data'), 'file.png', 'content');
  rejects(new Uint8Array(), 'file.txt', 'size');
  rejects(new Uint8Array(EVIDENCE_MAX_BYTES + 1), 'file.txt', 'size');
});
test('original PDF and image byte checks remain enforced; only those types preview inline', () => {
  for (const [ext, bytes] of [['pdf', text('%PDF-1.7')], ['png', Uint8Array.of(137,80,78,71,13,10,26,10)], ['jpg', Uint8Array.of(255,216,255)], ['webp', text('RIFF0000WEBP')]] as const) {
    const type = validateEvidenceUpload(bytes, `file.${ext}`, EVIDENCE_FILE_TYPES[ext]); assert.equal(evidenceInlineType(type), true);
  }
  for (const type of ['text/html', 'image/svg+xml', ...['csv','tsv','txt','json','docx','xlsx'].map(ext => EVIDENCE_FILE_TYPES[ext as keyof typeof EVIDENCE_FILE_TYPES])]) assert.equal(evidenceInlineType(type), false);
});
test('DOCX and XLSX package validation supports stored, deflated and streamed ZIP entries', async () => {
  for (const ext of ['docx', 'xlsx'] as const) for (const options of [{}, { compression: 'STORE' }, { streamFiles: true }]) {
    const bytes = await office(ext, undefined, options);
    assert.equal(validateEvidenceUpload(bytes, `file.${ext}`, ''), EVIDENCE_FILE_TYPES[ext]);
    assert.equal(validateEvidenceUpload(bytes, `file.${ext}`, 'application/zip'), EVIDENCE_FILE_TYPES[ext]);
    rejects(bytes, `file.${ext === 'docx' ? 'xlsx' : 'docx'}`, 'office');
  }
});
test('generic ZIP, missing content types, external main relationship and malformed XML are not Office documents', async () => {
  const cases = [
    (z: JSZip) => z.remove('word/document.xml'),
    (z: JSZip) => z.remove('[Content_Types].xml'),
    (z: JSZip) => z.file('[Content_Types].xml', '<Types><broken>'),
    (z: JSZip) => z.file('[Content_Types].xml', '<!DOCTYPE Types [<!ENTITY x "bad">]><Types/>'),
    (z: JSZip) => z.file('_rels/.rels', `<Relationships xmlns="${ns}relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" TargetMode="External"/></Relationships>`),
  ];
  for (const mutate of cases) rejects(await office('docx', mutate), 'file.docx', 'office');
});
test('Office admission rejects macros, embedded binary objects, path traversal, duplicate names and decompression bombs', async () => {
  for (const name of ['word/vbaProject.bin', 'word/embeddings/file.dat', 'xl/macrosheets/sheet1.xml', '../outside.xml', 'WORD/DOCUMENT.XML']) rejects(await office('docx', z => z.file(name, 'malicious')), 'file.docx', 'office');
  rejects(await office('docx', z => z.file('huge.txt', 'A'.repeat(2 * 1024 * 1024))), 'file.docx', 'office');
  rejects(await office('docx', z => z.file('[Content_Types].xml', `<Types xmlns="${ns}content-types"><Default Extension="xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>`)), 'file.docx', 'office');
});
test('encrypted flags, corrupt compressed content, CRC mismatch and truncated ZIP are rejected', async () => {
  const bytes = await office('docx'), changed = bytes.slice(); changed[6] |= 1;
  rejects(changed, 'file.docx', 'office');
  const stored = await office('docx', undefined, { compression: 'STORE' });
  const view = new DataView(stored.buffer), dataStart = 30 + view.getUint16(26, true) + view.getUint16(28, true); stored[dataStart] ^= 1;
  rejects(stored, 'file.docx', 'office');
  const corrupt = bytes.slice(), cv = new DataView(corrupt.buffer), start = 30 + cv.getUint16(26, true) + cv.getUint16(28, true); corrupt[start] ^= 0xff;
  rejects(corrupt, 'file.docx', 'office');
  for (const length of [5, 30, bytes.length - 1]) rejects(bytes.slice(0, length), 'file.docx', 'office');
});
