import { parseSampleCsv } from './workpaper-sample-import';
import { AuditRequestError } from './audit-requests';
import type { WorkpaperFields } from './audit-workpapers';

export const POPULATION_BYTES = 256 * 1024;
export const POPULATION_ROWS = 5000;
export const SAMPLING_ALGORITHM = 'sha256-fisher-yates-v1' as const;
export type RandomSelectionInput = { source: string; seed: string; count: number; reason: string };
export type RandomSelection = {
  algorithm: typeof SAMPLING_ALGORITHM; seed: string; populationSha256: string;
  populationCount: number; sampleCount: number; references: string[]; reason: string;
};
export type SavedRandomSelection = RandomSelection & { selectedBy: string; selectedAt: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const hash = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
export const randomSelectionSeed = () => hex(crypto.getRandomValues(new Uint8Array(32)));

/** Versioned, order-independent population fingerprint and sampling without replacement.
 * Seeded SHA-256 blocks feed a partial Fisher–Yates shuffle. Rejection sampling
 * avoids modulo bias. Never interpret the chosen sample size as a confidence level. */
export async function selectRandomSamples(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('sampling');
  const input = value as RandomSelectionInput;
  if (Object.keys(input).some(k => !['source', 'seed', 'count', 'reason'].includes(k)) ||
      typeof input.source !== 'string' || typeof input.seed !== 'string' || !/^[a-f0-9]{64}$/.test(input.seed) ||
      !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 100 ||
      typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 2000) throw new AuditRequestError('sampling');
  const rows = parseSampleCsv(input.source, POPULATION_ROWS, POPULATION_BYTES);
  if (input.count > rows.length) throw new AuditRequestError('sampling');
  rows.sort((a, b) => a.reference.toLowerCase() < b.reference.toLowerCase() ? -1 : 1);
  const populationSha256 = hex(await hash(JSON.stringify(rows.map(r => [r.reference, r.note]))));
  let block = new Uint8Array(0), cursor = 0, counter = 0;
  async function below(bound: number) {
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (;;) {
      if (cursor >= block.length) { block = await hash(`${SAMPLING_ALGORITHM}\n${input.seed}\n${populationSha256}\n${counter++}`); cursor = 0; }
      const n = new DataView(block.buffer, block.byteOffset, block.byteLength).getUint32(cursor, false); cursor += 4;
      if (n < limit) return n % bound;
    }
  }
  for (let i = 0; i < input.count; i++) {
    const j = i + await below(rows.length - i);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const samples = rows.slice(0, input.count);
  const selection: RandomSelection = { algorithm: SAMPLING_ALGORITHM, seed: input.seed, populationSha256, populationCount: rows.length, sampleCount: input.count, references: samples.map(s => s.reference), reason: input.reason.trim() };
  return { samples, selection };
}

export function selectionMatches(selection: RandomSelection | undefined, fields: WorkpaperFields) {
  return Boolean(selection && selection.algorithm === SAMPLING_ALGORITHM && fields.method === 'random' &&
    selection.populationCount === fields.populationCount && selection.sampleCount === fields.samples.length &&
    selection.references.length === fields.samples.length && selection.references.every((ref, i) => ref === fields.samples[i].reference));
}
