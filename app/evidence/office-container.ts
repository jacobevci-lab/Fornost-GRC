import { inflateRawSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';

const MAX_PARTS = 1024, MAX_EXPANDED = 32 * 1024 * 1024, MAX_PART = 12 * 1024 * 1024, MAX_XML_METADATA = 256 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const contentNamespace = 'http://schemas.openxmlformats.org/package/2006/content-types';
const relationNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelation = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', 'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument'];
const mainTypes = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' };
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(bytes: Uint8Array) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function invalid(): never { throw new Error('office-container'); }
function xml(bytes: Uint8Array) {
  if (bytes.length > MAX_XML_METADATA) invalid();
  const source = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) invalid();
  let failed = false;
  const report = () => { failed = true; };
  const doc = new DOMParser({ errorHandler: { warning: report, error: report, fatalError: report } }).parseFromString(source, 'application/xml');
  if (failed || !doc.documentElement || doc.doctype) invalid();
  return doc;
}

/** Bounded ZIP/OPC admission, not Office rendering, schema validation or malware scanning. */
export function validateOfficeContainer(bytes: Uint8Array, extension: 'docx' | 'xlsx') {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true), u32 = (offset: number) => view.getUint32(offset, true);
  // Only standard single-disk ZIP is supported. ZIP64, encryption and executable prefixes are rejected.
  if (bytes.length < 22 || u32(0) !== 0x04034b50) invalid();
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6)) invalid();
  const count = u16(end + 10), directorySize = u32(end + 12), directoryStart = u32(end + 16);
  if (!count || count > MAX_PARTS || count !== u16(end + 8) || directoryStart + directorySize !== end) invalid();
  const entries: { name: string; start: number; finish: number; dataStart: number; compressed: number; size: number; method: number; crc: number }[] = [];
  const names = new Set<string>(); let cursor = directoryStart, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid();
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16), compressed = u32(cursor + 20), size = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32), start = u32(cursor + 42);
    const next = cursor + 46 + nameLength + extra + comment;
    if (next > end || !nameLength || nameLength > 512 || u16(cursor + 34) || flags & ~(0x0800 | 0x0008 | 0x0006) || ![0, 8].includes(method)) invalid();
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)), normalized = name.toLowerCase();
    if (/[^\x20-\x7e]|\\|%|:|^\//.test(name) || name.split('/').some(part => part === '.' || part === '..') || names.has(normalized)) invalid();
    if (/(^|\/)(activex|embeddings|macrosheets)(\/|$)|vbaproject|\.(bin|exe|dll|com|js|vbs|ps1|zip|docm|xlsm)$/i.test(name)) invalid();
    names.add(normalized);
    total += size;
    if (size > MAX_PART || total > MAX_EXPANDED || size > Math.max(1024 * 1024, compressed * 200) || start + 30 > directoryStart || u32(start) !== 0x04034b50) invalid();
    const localNameLength = u16(start + 26), localExtra = u16(start + 28), dataStart = start + 30 + localNameLength + localExtra;
    if (dataStart + compressed > directoryStart || u16(start + 6) !== flags || u16(start + 8) !== method || decoder.decode(bytes.subarray(start + 30, start + 30 + localNameLength)) !== name) invalid();
    let finish = dataStart + compressed;
    if (flags & 8) {
      if (finish + 12 > directoryStart) invalid();
      if (u32(finish) === 0x08074b50) finish += 4;
      if (finish + 12 > directoryStart || u32(finish) !== crc || u32(finish + 4) !== compressed || u32(finish + 8) !== size) invalid();
      finish += 12;
    } else if (u32(start + 14) !== crc || u32(start + 18) !== compressed || u32(start + 22) !== size) invalid();
    entries.push({ name, start, finish, dataStart, compressed, size, method, crc }); cursor = next;
  }
  if (cursor !== end) invalid();
  let position = 0;
  for (const entry of [...entries].sort((a, b) => a.start - b.start)) { if (entry.start !== position) invalid(); position = entry.finish; }
  if (position !== directoryStart) invalid();
  const main = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const metadata = new Map<string, Uint8Array>(); let hasMain = false;
  for (const entry of entries) {
    const input = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed);
    const output = entry.method === 0 ? input : inflateRawSync(input, { maxOutputLength: Math.max(1, entry.size) });
    if (output.length !== entry.size || crc32(output) !== entry.crc) invalid();
    if (entry.name === main) { if (!output.length) invalid(); hasMain = true; }
    if (entry.name === '[Content_Types].xml' || entry.name === '_rels/.rels') {
      if (output.length > MAX_XML_METADATA) invalid();
      metadata.set(entry.name, output);
    }
  }
  if (!hasMain || !metadata.has('[Content_Types].xml') || !metadata.has('_rels/.rels')) invalid();
  const types = xml(metadata.get('[Content_Types].xml')!);
  if (types.documentElement.localName !== 'Types' || types.documentElement.namespaceURI !== contentNamespace) invalid();
  const declarations = types.documentElement.childNodes; let matched = 0;
  for (let i = 0; i < declarations.length; i++) {
    const node = declarations.item(i)!;
    if (node.nodeType !== 1) continue;
    const element = node as Element, type = element.getAttribute('ContentType') || '';
    if (/macroenabled|vbaproject|activex|oleobject|macrosheet/i.test(type)) invalid();
    if (element.namespaceURI === contentNamespace && element.localName === 'Override' && element.getAttribute('PartName') === `/${main}` && type === mainTypes[extension]) matched++;
  }
  if (matched !== 1) invalid();
  const relations = xml(metadata.get('_rels/.rels')!);
  if (relations.documentElement.localName !== 'Relationships' || relations.documentElement.namespaceURI !== relationNamespace) invalid();
  const links = relations.getElementsByTagNameNS(relationNamespace, 'Relationship'); let mainLinks = 0;
  for (let i = 0; i < links.length; i++) {
    const link = links.item(i)!;
    if (!officeRelation.includes(link.getAttribute('Type') || '')) continue;
    if ((link.getAttribute('Target') || '').replace(/^\//, '') !== main || (link.getAttribute('TargetMode') || 'Internal') !== 'Internal') invalid();
    mainLinks++;
  }
  if (mainLinks !== 1) invalid();
  return true;
}
