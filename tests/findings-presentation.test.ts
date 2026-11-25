import assert from 'node:assert/strict';
import test from 'node:test';
import {findingActionAvailability,findingLabel,findingTimestamp} from '../app/findings/presentation';
const finding={status:'verification',owner:'owner@test.invalid',reviewer:'reviewer@test.invalid',detectedBy:'maker@test.invalid',submittedBy:'submitter@test.invalid'};
const admin=(email:string)=>({role:'Admin',email});
test('CAPA approval controls enforce assigned reviewer and maker-checker separation',()=>{
 assert.equal(findingActionAvailability(finding,admin(finding.reviewer)).verify,true);
 for(const email of [finding.owner,finding.detectedBy,finding.submittedBy,'other@test.invalid'])assert.equal(findingActionAvailability(finding,admin(email)).verify,false);
 for(const field of ['owner','detectedBy','submittedBy'])assert.equal(findingActionAvailability({...finding,[field]:finding.reviewer},admin(finding.reviewer)).verify,false);
 assert.equal(findingActionAvailability({...finding,submittedBy:undefined},admin(finding.reviewer)).verify,false);
 assert.equal(findingActionAvailability({...finding,detectedBy:undefined},admin(finding.reviewer)).verify,false);
});
test('CAPA action controls respect role, ownership and lifecycle',()=>{
 for(const role of ['Viewer','Unknown'])assert.deepEqual(Object.values(findingActionAvailability(finding,{role,email:finding.reviewer})),[false,false,false,false,false]);
 assert.equal(findingActionAvailability({...finding,status:'open'},{role:'Editor',email:finding.owner}).start,true);
 assert.equal(findingActionAvailability({...finding,status:'open'},{role:'Editor',email:'other@test.invalid'}).start,false);
 assert.equal(findingActionAvailability({...finding,status:'in-progress'},{role:'Editor',email:finding.owner}).submit,true);
 assert.equal(findingActionAvailability({...finding,status:'closed'},admin('other@test.invalid')).reopen,true);
 assert.equal(findingActionAvailability({...finding,status:'open'},admin('other@test.invalid')).reopen,false);
});
test('risk acceptance is available only to independent assigned admin before verification',()=>{
 for(const status of ['open','in-progress']){
  assert.equal(findingActionAvailability({...finding,status},admin(finding.reviewer)).acceptRisk,true);
  assert.equal(findingActionAvailability({...finding,status},admin(finding.owner)).acceptRisk,false);
  assert.equal(findingActionAvailability({...finding,status,detectedBy:finding.reviewer},admin(finding.reviewer)).acceptRisk,false);
 }
 for(const status of ['verification','accepted','closed'])assert.equal(findingActionAvailability({...finding,status},admin(finding.reviewer)).acceptRisk,false);
});
test('CAPA labels keep unknown audit values visible and timestamps are explicitly UTC',()=>{
 assert.equal(findingLabel('acceptance-expired','tr'),'Risk kabul süresi doldu');
 assert.equal(findingLabel('in-progress','en'),'In progress');
 for(const value of ['future-event','constructor','__proto__'])assert.equal(findingLabel(value,'tr'),value);
 assert.equal(findingLabel('','tr'),'—');
 assert.match(findingTimestamp('2026-10-07T08:00:00Z','en'),/08:00 UTC$/);
 assert.match(findingTimestamp('2026-10-07T11:00:00+03:00','tr'),/08:00 UTC$/);
 assert.equal(findingTimestamp('invalid','tr'),'invalid');
});
