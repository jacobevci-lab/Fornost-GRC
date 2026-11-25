import test from 'node:test';
import assert from 'node:assert/strict';
import {validity,renewalNeeded,recoverySummary,usableSupport,type AssuranceDocument} from '../app/third-party-risk/assurance';
const doc=(kind:AssuranceDocument['kind'],expires:string):AssuranceDocument=>({kind,expires,available:1,code:'EVD-123',evidenceId:'EVD-original',revision:'r1',versionId:'v1',versionNo:1,title:'Evidence',sha256:'a'.repeat(64)});
test('document calendar boundaries, missing evidence and ISO/SOC alternatives',()=>{
  const today='2028-02-01',d=doc('dpa','2028-03-02'),soc=doc('soc','2028-01-30');
  assert.equal(validity(d,today),'soon');assert.equal(validity({...d,expires:'2028-03-03'},today),'valid');
  assert.equal(validity({...d,expires:today},today),'soon');assert.equal(validity(soc,today),'expired');assert.equal(validity({...d,available:0},today),'missing');
  const vendor={name:'Cloud',vendorId:'VEN-X',status:'approved',criticality:'Tier-1',documents:[d,soc]};
  assert.equal(renewalNeeded(vendor,today),true);assert.equal(renewalNeeded({...vendor,documents:[d,soc,doc('iso','2028-06-30')]},today),false);
  assert.deepEqual(usableSupport({...vendor,documents:[soc],supportIds:[soc.evidenceId]},today),[]);
});
test('blast radius independently reduces known targets, preserves zero and leaves absent classifications unknown',()=>{
  assert.deepEqual(recoverySummary([{data:{criticality:'Kritik',rto:2,rpo:4}},{data:{criticality:'critical',rto:8,rpo:0}},{data:{criticality:'high',rpo:''}}]),{rto:2,rpo:0,critical:2});
  assert.deepEqual(recoverySummary([{data:{rto:'',rpo:-1}}]),{rto:null,rpo:null,critical:null});
});
