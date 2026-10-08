import test from 'node:test';
import assert from 'node:assert/strict';
import {missingAssuranceContextTable,validAssuranceQueueContext} from '../app/assurance-queue-context';
import {validAssuranceQueue} from '../app/assurance-queue-access';
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
