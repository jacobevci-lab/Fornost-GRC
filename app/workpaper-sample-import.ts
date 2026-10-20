import type { WorkpaperSample } from './audit-workpapers';
export const SAMPLE_IMPORT_BYTES = 1024 * 1024;
export const sampleImportTemplate = 'reference,note\r\nAccount-001,Selected from the approved population\r\n';
export class SampleImportError extends Error {
  constructor(public code: 'size' | 'format' | 'headers' | 'empty' | 'reference' | 'note' | 'duplicate' | 'limit' | 'population', public row = 0) { super(code); }
}
/** Strict two-column CSV. Reject the whole import; never silently truncate or overwrite. */
export function parseSampleImport(source: string, existing: readonly WorkpaperSample[], populationCount: number): WorkpaperSample[] {
  if (new TextEncoder().encode(source).length > SAMPLE_IMPORT_BYTES) throw new SampleImportError('size');
  const text = source.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new SampleImportError('empty');
  const header = text.split(/\r?\n/, 1)[0];
  const delimiter = [',', ';', '\t'].find(d => header.includes(d)) || ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; if (row.length > 2) throw new SampleImportError('format', rows.length + 1); };
  const endRow = () => { endCell(); if (row.some(v => v.trim())) rows.push(row); row = []; if (rows.length > 101) throw new SampleImportError('limit'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === delimiter) endCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"' || c === '\0') throw new SampleImportError('format', rows.length + 1); cell += c; }
    if (cell.length > 2000) throw new SampleImportError('note', rows.length + 1);
  }
  if (quoted) throw new SampleImportError('format', rows.length + 1);
  if (cell || row.length || closed) endRow();
  if (rows[0]?.length !== 2 || rows[0][0].trim().toLowerCase() !== 'reference' || rows[0][1].trim().toLowerCase() !== 'note') throw new SampleImportError('headers');
  if (rows.length < 2) throw new SampleImportError('empty');
  if (existing.length + rows.length - 1 > 100) throw new SampleImportError('limit');
  if (!Number.isSafeInteger(populationCount) || populationCount < 1 || populationCount > 1_000_000_000 || existing.length + rows.length - 1 > populationCount) throw new SampleImportError('population');
  const seen = new Set(existing.map(s => s.reference.trim().toLowerCase()));
  return rows.slice(1).map((r, i) => {
    const rowNumber = i + 2;
    if (r.length !== 2) throw new SampleImportError('format', rowNumber);
    const reference = r[0].trim(), note = r[1].trim();
    if (!reference || reference.length > 200 || /[\r\n\0]/.test(reference)) throw new SampleImportError('reference', rowNumber);
    if (note.length > 2000 || note.includes('\0')) throw new SampleImportError('note', rowNumber);
    if (seen.has(reference.toLowerCase())) throw new SampleImportError('duplicate', rowNumber);
    seen.add(reference.toLowerCase());
    return { reference, note, result: 'pending', versionId: '' };
  });
}
