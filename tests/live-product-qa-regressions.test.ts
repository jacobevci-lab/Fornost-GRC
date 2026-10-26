import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceEligibilityLabel } from '../app/use-evidence-assurance';
import { evaluateEvidenceEligibility } from '../app/evidence/eligibility';
import { buildExecutiveAssurance } from '../app/executive-assurance';
import { connectedTitle, buildConnectedGrcGraph } from '../app/connected-grc-model';
import { coreRecordSessionKey, readCoreRecordSession, writeCoreRecordSession } from '../app/core-record-session';
import { resolveCoreRecord } from '../app/core-record-focus';

test('list freshness uses the same approval, expiry and validation decision as executive metrics', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  for (const data of [
    {status:'Approved',expiresAt:'2026-10-26'},
    {status:'Approved',expiresAt:'2026-10-25'},
    {status:'Approved',expiresAt:'2026-10-27',freshUntil:'2026-10-26T11:59:59Z'},
    {status:'Approved',expiresAt:'invalid'},
    {status:'Draft'}, {status:'Rejected'}, {status:'Approved',reviewStatus:'pending-review'},
    {status:'Approved',validationStatus:'fail'}, {status:'Approved',evidenceIntegrity:'broken'},
    {status:'Approved',evidenceIntegrity:'unavailable'}, {status:'Approved',automationAssessment:'configuration-changed'},
  ]) {
    const current=evaluateEvidenceEligibility(data,now).current;
    assert.equal(evidenceEligibilityLabel(data,now,'tr')==='Güncel',current,JSON.stringify(data));
    assert.equal(evidenceEligibilityLabel(data,now,'en')==='Current',current,JSON.stringify(data));
    assert.equal(buildExecutiveAssurance([{id:'E1',module:'Kanıtlar',data}],now.toISOString()).currentEvidence,Number(current));
  }
  assert.equal(evidenceEligibilityLabel({status:'Approved',expiresAt:'2026-10-26T12:00:00Z'},now,'en'),'Expired');
});

test('graph titles identify the object without changing control-reference relationship matching',()=>{
  const control={id:'C1',code:'CTL-001',module:'Kontroller',data:{controlRef:'CTL-001',controlTitle:'Access review'}};
  const evidence={id:'E1',code:'EVD-001',module:'Kanıtlar',data:{controlRef:'CTL-001',evidenceTitle:'October access evidence'}};
  const audit={id:'A1',code:'AUD-001',module:'Denetim Yönetimi',data:{controlRef:'CTL-001',requirementTitle:'Check access removals',auditName:'ISO'}};
  assert.deepEqual([control,evidence,audit].map(connectedTitle),['Access review','October access evidence','Check access removals']);
  const graph=buildConnectedGrcGraph([control,evidence,audit]);
  assert.equal(graph.unresolved.length,0);assert.equal(graph.links.length,2);
  assert.ok(graph.links.every(link=>link.target.id==='C1'));
});

function storage(){const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
test('reload preserves per-user target and map context, while fresh authorized rows determine access',()=>{
  const s=storage();const request={module:'Kontroller',kind:'record',ref:'CTL-001',source:'connected-grc-register',returnTo:{module:'Bağlantılı GRC',kind:'connected-view',filter:{query:'CTL-001',selectedId:'C1',page:'2',view:'explore'}}};
  writeCoreRecordSession(()=>s,'alice',request);
  const restored=readCoreRecordSession(()=>s,'alice',()=>true)!;
  assert.equal(restored.ref,'CTL-001');assert.deepEqual(restored.returnTo,request.returnTo);
  assert.equal(readCoreRecordSession(()=>s,'bob',()=>true),null);
  assert.equal(readCoreRecordSession(()=>s,'alice',m=>m!=='Kontroller'),null);
  assert.equal(readCoreRecordSession(()=>s,'alice',m=>m!=='Bağlantılı GRC')?.returnTo,undefined);
  assert.equal(resolveCoreRecord([],restored),null);
  assert.equal(resolveCoreRecord([{id:'C1',code:'CTL-001',module:'Kontroller',data:{}}],restored)?.id,'C1');
  writeCoreRecordSession(()=>s,'alice',null);assert.equal(readCoreRecordSession(()=>s,'alice',()=>true),null);
});
test('invalid or unavailable preference storage never creates a target',()=>{
  const s=storage();for(const raw of ['null','[]','{',JSON.stringify({module:'Kontroller',kind:'record',ref:{id:'C1'}}),'x'.repeat(9000)]){
    s.setItem(coreRecordSessionKey('a'),raw);assert.equal(readCoreRecordSession(()=>s,'a',()=>true),null);
  }
  const unavailable=()=>{throw new Error('storage disabled');};
  assert.equal(readCoreRecordSession(unavailable,'a',()=>true),null);
  assert.doesNotThrow(()=>writeCoreRecordSession(unavailable,'a',{module:'Kontroller',kind:'record',ref:'C1'}));
});
