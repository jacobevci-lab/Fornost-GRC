import test from 'node:test';
import assert from 'node:assert/strict';
import {missingAssuranceContextTable,validAssuranceQueueContext,validAssuranceSourceState,assuranceSourceReady,type AssuranceSourceState} from '../app/assurance-queue-context';
import {validAssuranceQueue,canReviewAssuranceWork} from '../app/assurance-queue-access';
import {assuranceQueueSummary} from '../app/assurance-queue-summary';
test('only named legacy context tables permit reduced reads',()=>{
 for(const name of ['enterprise_findings','evidence_automation_findings','evidence_automation_rules'])assert.equal(missingAssuranceContextTable(new Error(`D1_ERROR: no such table: main.${name}: SQLITE_ERROR`)),true);
 for(const message of ['no such table: enterprise_findings_archive','no such table: continuous_assurance_work_items','permission denied','no such column: owner'])assert.equal(missingAssuranceContextTable(new Error(message)),false);
});
test('context contract rejects unrecognized and malformed metadata',()=>{
 const body={items:[],summary:assuranceQueueSummary([])};
 for(const context of ['full','without-capa','work-only']){assert.equal(validAssuranceQueueContext(context),true);assert.equal(validAssuranceQueue({...body,context}),true);}
 for(const context of [null,{},false,'partial',''])assert.equal(validAssuranceQueue({...body,context}),false);
 assert.equal(validAssuranceQueue(body),true,'legacy responses remain supported');
});


test('broken source links prevent review and cannot be disguised as valid metadata',()=>{
 const row={id:'W',findingId:'F',ruleId:'R',action:'control-retest',status:'pending-review',findingTitle:'Title',severity:'high',owner:'owner',dueDate:'',ruleName:'Rule',controlRefs:'CTRL',updatedAt:'',actor:'creator@test.invalid'};
 for(const sourceState of ['missing-finding','missing-rule','rule-mismatch','unavailable'] as AssuranceSourceState[]){
  const item={...row,sourceState};
  assert.equal(validAssuranceQueue({items:[item],summary:assuranceQueueSummary([item])}),true);
  assert.equal(assuranceSourceReady(item),false);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@test.invalid',item,'approve',''),false);
 }
 for(const sourceState of [null,{},false,'partial','']){
  assert.equal(validAssuranceSourceState(sourceState),false);
  assert.equal(validAssuranceQueue({items:[{...row,sourceState}],summary:assuranceQueueSummary([row])}),false);
 }
 assert.equal(assuranceSourceReady({sourceState:'linked'}),true);
 assert.equal(assuranceSourceReady({}),true);
});
