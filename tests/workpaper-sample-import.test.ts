import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSampleImport, SampleImportError, SAMPLE_IMPORT_BYTES } from '../app/workpaper-sample-import';
const sample = { reference: 'Account-001', note: 'Retained', result: 'pass' as const, versionId: 'EV-1' };
const rejects = (text: string, code: string, existing = [sample], population = 100) => assert.throws(() => parseSampleImport(text, existing, population), (e: unknown) => e instanceof SampleImportError && e.code === code);
test('CSV imports refs and notes only, leaving evidence and results for human testing', () => {
  const existing = structuredClone(sample);
  assert.deepEqual(parseSampleImport('\uFEFFreference,note\r\n"Account,002","Quoted ""approval""\nsecond line"\r\nAccount-003,\r\n', [existing], 3), [
    { reference: 'Account,002', note: 'Quoted "approval"\nsecond line', result: 'pending', versionId: '' },
    { reference: 'Account-003', note: '', result: 'pending', versionId: '' },
  ]);
  assert.deepEqual(existing, sample);
  for (const separator of [';', '\t']) assert.equal(parseSampleImport(`reference${separator}note\nREF${separator}text`, [], 1)[0].reference, 'REF');
});
test('imports reject duplicates inside CSV and across the current draft without dropping rows', () => {
  rejects('reference,note\n account-001 ,changed', 'duplicate');
  rejects('reference,note\nNew,first\n NEW ,second', 'duplicate');
});
test('imports enforce the current population, 100 combined samples and byte limit', () => {
  rejects('reference,note\nNew,', 'population', [sample], 1);
  rejects('reference,note\nNew,', 'population', [], NaN);
  const csv = 'reference,note\n' + Array.from({length:100}, (_, i) => `S-${i},`).join('\n');
  assert.equal(parseSampleImport(csv, [], 100).length, 100);
  rejects(csv, 'limit'); rejects(csv + '\nOVER,', 'limit', []);
  rejects('reference,note\n' + 'ş'.repeat(SAMPLE_IMPORT_BYTES / 2), 'size', []);
});
test('malformed, unexpected and truncated data is rejected instead of partially importing', () => {
  rejects('reference,result\nR,pass', 'headers');
  rejects('reference,note,versionId\nR,test,EV-1', 'format');
  rejects('reference,note\nR,"unfinished', 'format');
  rejects('reference,note\nR,"closed"extra', 'format');
  rejects('reference,note\nR,valid\nBroken', 'format');
  rejects('reference,note\n,missing reference', 'reference');
  rejects('reference,note\n"line\nbreak",note', 'reference');
  rejects('reference,note\n' + 'R'.repeat(201) + ',note', 'reference');
  rejects('reference,note\nR,' + 'N'.repeat(2001), 'note');
  rejects('reference,note\nR,"nul\0note"', 'note');
  rejects('reference,note\n\n', 'empty');
});
test('formula-like text stays literal and importing never interprets commands or markup', () => {
  const result = parseSampleImport('reference,note\n=1+1,<img src=x onerror=alert(1)>', [], 1);
  assert.equal(result[0].reference, '=1+1'); assert.equal(result[0].result, 'pending');
});
