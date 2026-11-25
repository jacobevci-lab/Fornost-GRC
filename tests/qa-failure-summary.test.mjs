import test from 'node:test';
import assert from 'node:assert/strict';
import {qaFailureSummary,ownedEvidenceQaIds} from '../scripts/qa-failure-summary.mjs';

test('request errors retain diagnostics without serializing credentials, URLs or payloads',()=>{
  const secret='synthetic-session-secret';
  for(const message of [`read ECONNRESET\nCall log:\n cookie: fornost_session=${secret}`,`https://example.test/?token=${secret}`,`Authorization: Bearer ${secret}`,`Error: ${secret}`]){
    const summary=qaFailureSummary(new Error(message));assert.ok(!summary.includes(secret));assert.ok(!summary.includes('http'));assert.ok(!summary.includes('cookie'));
  }
  assert.equal(qaFailureSummary(new Error('read ECONNRESET')),'Transport failure: ECONNRESET');
  assert.equal(qaFailureSummary({code:'ERR_ASSERTION',message:secret}),'Assertion failed');
  assert.equal(qaFailureSummary({name:'TimeoutError',message:secret}),'Operation timed out');
  assert.equal(qaFailureSummary(secret),'QA operation failed');
});

test('lost-response recovery selects only the exact owned run fixtures',()=>{
  const prefix='QA-EVIDENCE-FIX-11111111-1111-4111-8111-111111111111';
  const row=(id,module,data)=>({id,module,data_json:JSON.stringify(data)});
  const rows=[row('control','Kontroller',{controlRef:prefix,controlTitle:prefix}),row('evidence','Kanıtlar',{evidenceTitle:prefix}),row('copy','Kanıtlar',{evidenceTitle:prefix+' copy'}),row('foreign','Kontroller',{controlRef:prefix,controlTitle:'Customer record'}),row('other-run','Kanıtlar',{evidenceTitle:prefix+' other'}),row('other-module','Politikalar',{evidenceTitle:prefix}),{id:'broken',data_json:'broken'}];
  assert.deepEqual(ownedEvidenceQaIds(rows,prefix),['control','evidence','copy']);
  for(const invalid of ['', 'QA-EVIDENCE-FIX-', 'QA-EVIDENCE-FIX-.*'])assert.throws(()=>ownedEvidenceQaIds(rows,invalid),/Exact run identity/);
});
