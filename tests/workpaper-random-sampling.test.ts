import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { selectRandomSamples, selectionMatches, randomSelectionSeed, POPULATION_BYTES } from '../app/workpaper-random-sampling';
import { emptyWorkpaper } from '../app/audit-workpapers';

const input = { source: 'reference,note\nA,first\nB,second\nC,third\nD,fourth\nE,fifth', seed: '12'.repeat(32), count: 3, reason: 'Draw from the complete export' };
test('random selection is deterministic, row-order independent, unique and never supplies test outcomes', async () => {
  const a = await selectRandomSamples(input);
  const b = await selectRandomSamples({ ...input, source: '\uFEFFreference;note\r\nE;fifth\r\nD;fourth\r\nC;third\r\nB;second\r\nA;first\r\n' });
  assert.deepEqual(a, b);
  // Independent Python hashlib/Fisher–Yates reference vector locks the v1 format.
  assert.deepEqual(a.selection.references, ['D','B','C']);
  assert.equal(a.selection.populationSha256, '131a6b4a2d91745aa6e2e7d963cc9d379290da57772c449b3e00d2820a344675');
  assert.equal(new Set(a.selection.references).size, 3);
  assert.equal(a.selection.populationSha256, createHash('sha256').update(JSON.stringify([['A','first'],['B','second'],['C','third'],['D','fourth'],['E','fifth']])).digest('hex'));
  assert.ok(a.samples.every(s => s.result === 'pending' && s.versionId === ''));
  assert.notEqual((await selectRandomSamples({ ...input, source: input.source.replace('first', 'changed') })).selection.populationSha256, a.selection.populationSha256);
  assert.deepEqual((await selectRandomSamples({ ...input, count: 5 })).selection.references.slice(0,3), a.selection.references);
  assert.deepEqual((await selectRandomSamples({ ...input, source:'reference,note\nOnly,', count:1 })).selection.references, ['Only']);
  assert.equal(input.count, 3);
});
test('seed generation and sample/population bounds are explicit; malformed populations never partially select', async () => {
  assert.match(randomSelectionSeed(), /^[a-f0-9]{64}$/);
  for (const patch of [{seed:''},{seed:'A'.repeat(64)},{count:0},{count:1.2},{count:101},{count:6},{reason:'  '},{reason:'x'.repeat(2001)},{source:null},{proof:'forged'}]) await assert.rejects(selectRandomSamples({...input,...patch}), /sampling/);
  for (const [source, code] of [
    ['reference,note\nA,one\n a ,two','duplicate'], ['reference,note\nA,one\nInvalid','format'],
    ['reference,result\nA,pass','headers'], ['reference,note\nA,"unfinished','format'],
    ['reference,note\n'+'ş'.repeat(POPULATION_BYTES/2),'size'],
    ['reference,note\n'+Array.from({length:5001},(_,i)=>`R${i},`).join('\n'),'limit'],
  ]) await assert.rejects(selectRandomSamples({...input,source,count:1}), new RegExp(code));
  const max=await selectRandomSamples({...input,source:'reference,note\n'+Array.from({length:5000},(_,i)=>`R${i},`).join('\n'),count:100});
  assert.equal(max.selection.populationCount,5000);assert.equal(new Set(max.selection.references).size,100);
});
test('saved selection binds exact ordered references and population count while permitting human test notes/results', async () => {
  const {samples,selection}=await selectRandomSamples(input);
  const fields={...emptyWorkpaper,method:'random' as const,populationCount:5,samples};
  assert.equal(selectionMatches(selection,fields),true);
  assert.equal(selectionMatches(selection,{...fields,samples:samples.map(s=>({...s,note:'Verified',result:'pass' as const,versionId:'EV-1'}))}),true);
  for(const patch of [{method:'judgmental' as const},{populationCount:6},{samples:samples.slice(1)},{samples:[...samples].reverse()},{samples:samples.map((s,i)=>i? s:{...s,reference:s.reference.toLowerCase()})}]) assert.equal(selectionMatches(selection,{...fields,...patch}),false);
  assert.equal(selectionMatches(undefined,fields),false);
});
