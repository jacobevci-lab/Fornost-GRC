import test from 'node:test';
import assert from 'node:assert/strict';
import {assuranceWorkFocus,assuranceWorkNavigation,parseAssuranceWorkId,validFocusedAssuranceQueue} from '../app/assurance-work-focus';
import {assuranceQueueSummary} from '../app/assurance-queue-summary';

test('priority navigation carries the exact governed work ID into the native queue',()=>{
 const target=assuranceWorkNavigation({kind:'work-item',id:'work:CAW-12'});
 assert.deepEqual(target,{module:'Bağlantılı GRC',kind:'assurance-work',ref:'CAW-12',source:'assurance-work-priority'});
 assert.equal(assuranceWorkFocus(target),'CAW-12');
 assert.equal(assuranceWorkFocus({...target!,module:'Connected GRC Map'}),'CAW-12');
 for(const value of [{kind:'finding',id:'work:CAW-12'},{kind:'work-item',id:'CAW-12'},{kind:'work-item',id:'work:'},{kind:'work-item',id:'work: W'}])assert.equal(assuranceWorkNavigation(value),null);
 assert.equal(assuranceWorkFocus({...target!,module:'Kanıt Otomasyonu'}),null);
 assert.equal(assuranceWorkFocus({...target!,kind:'record'}),null);
 assert.equal(assuranceWorkFocus({...target!,ref:'bad\nID'}),null);
 assert.equal(parseAssuranceWorkId('CaW-12'),'CaW-12');assert.equal(parseAssuranceWorkId(null),null);
});

test('focused response must echo identity, contain only the target and declare complete single-record scope',()=>{
 const item={id:'W',findingId:'F',ruleId:'R',action:'control-retest',status:'completed',findingTitle:'Finding',severity:'high',owner:'',dueDate:'',ruleName:'Rule',controlRefs:'',updatedAt:'',actor:'creator@test.invalid'};
 const body={workItemId:'W',filter:'all',items:[item],nextCursor:null,coverage:{loaded:1,complete:true},summary:assuranceQueueSummary([item])};
 assert.equal(validFocusedAssuranceQueue(body,'W'),true);
 assert.equal(validFocusedAssuranceQueue({...body,items:[],coverage:{loaded:0,complete:true},summary:assuranceQueueSummary([])},'W'),true);
 for(const patch of [{workItemId:'W-10'},{workItemId:undefined},{filter:'active'},{coverage:{loaded:1,complete:false}},{coverage:undefined},{nextCursor:undefined},{items:[{...item,id:'W-10'}]},{summary:{...body.summary,total:2}}])assert.equal(validFocusedAssuranceQueue({...body,...patch},'W'),false);
 assert.equal(validFocusedAssuranceQueue({...body,items:[item,{...item,id:'W-10'}],coverage:{loaded:2,complete:true},summary:assuranceQueueSummary([item,{...item,id:'W-10'}])},'W'),false);
});
