import assert from 'node:assert/strict';
import test from 'node:test';
import {canStartAssuranceReview,canReviewAssuranceWork,validAssuranceQueue,assuranceQueueComplete} from '../app/assurance-queue-access';
test('queue review requires independent identified Admin and pending work',()=>{
 const item={status:'pending-review',actor:' Creator@Example.test '};
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'approve',''),true);
 for(const role of ['Viewer','Editor','Unknown'])assert.equal(canReviewAssuranceWork(role,'reviewer@example.test',item,'approve',''),false);
 for(const email of ['','creator@example.test',' CREATOR@example.test '])assert.equal(canReviewAssuranceWork('Admin',email,item,'approve',''),false);
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',{...item,actor:''},'approve',''),false);
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',{...item,status:'completed'},'approve',''),false);
});
test('review notes match API limits and reject whitespace-only explanations',()=>{
 const item={status:'pending-review',actor:'creator@example.test'};
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','          '),false);
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','Valid rejection reason'),true);
 assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'approve','x'.repeat(1201)),false);
});
test('incomplete queue responses cannot be interpreted as healthy empty results',()=>{
 assert.equal(validAssuranceQueue({items:[]}),false);
 const body={items:[],summary:{total:0,pendingReview:0,awaitingRetest:0,capaPromotion:0,retest:0,failedRetest:0,retestError:0,completed:0,rejected:0}};
 assert.equal(validAssuranceQueue(body),true);
 assert.equal(validAssuranceQueue({...body,items:[{id:'broken'}]}),false);
 assert.equal(validAssuranceQueue({...body,summary:{...body.summary,total:'0'}}),false);
});

test('queue rejects corrupt counters, duplicate identities and inconsistent coverage',()=>{
 const item={id:'W-1',findingId:'F-1',ruleId:'R-1',action:'control-retest',status:'pending-review',findingTitle:'Finding',severity:'high',owner:'',dueDate:'',ruleName:'Rule',controlRefs:'',updatedAt:'',actor:'creator@test.invalid'};
 const summary={total:1,pendingReview:1,awaitingRetest:0,capaPromotion:0,retest:1,failedRetest:0,retestError:0,completed:0,rejected:0};
 const body={items:[item],summary,coverage:{loaded:1,complete:true}};
 assert.equal(validAssuranceQueue(body),true);
 for(const total of [-1,0,0.5,NaN,Infinity,2])assert.equal(validAssuranceQueue({...body,summary:{...summary,total}}),false);
 assert.equal(validAssuranceQueue({...body,summary:{...summary,pendingReview:-1}}),false);
 assert.equal(validAssuranceQueue({...body,items:[item,item],summary:{...summary,total:2},coverage:{loaded:2,complete:true}}),false);
 for(const coverage of [null,{},[],{loaded:0,complete:true},{loaded:1,complete:'yes'},{loaded:1,complete:false}])assert.equal(validAssuranceQueue({...body,coverage}),false);
 assert.equal(validAssuranceQueue({...body,items:[{...item,id:' ' }]}),false);
});

test('legacy full queues are conservatively partial until a server supplies coverage',()=>{
 const items=Array.from({length:500},(_,i)=>({id:`W-${i}`,findingId:'F',ruleId:'R',action:'control-retest',status:'pending-review',findingTitle:'Finding',severity:'high',owner:'',dueDate:'',ruleName:'Rule',controlRefs:'',updatedAt:'',actor:'creator@test.invalid'}));
 const body={items,summary:{total:500,pendingReview:500,awaitingRetest:0,capaPromotion:0,retest:500,failedRetest:0,retestError:0,completed:0,rejected:0}};
 assert.equal(validAssuranceQueue(body),true);assert.equal(assuranceQueueComplete(body),false);
 assert.equal(assuranceQueueComplete({...body,coverage:{loaded:500,complete:true}}),true);
 assert.equal(assuranceQueueComplete({...body,coverage:{loaded:500,complete:false}}),false);
 assert.equal(assuranceQueueComplete({...body,items:[...items, {...items[0],id:'overflow'}]}),false);
});

test('continuation must match the last record and declared coverage',()=>{
 const items=Array.from({length:500},(_,i)=>({id:`W-${i}`,findingId:'F',ruleId:'R',action:'control-retest',status:'pending-review',findingTitle:'Finding',severity:'high',owner:'',dueDate:'',ruleName:'Rule',controlRefs:'',updatedAt:'2026-10-08T00:00:00Z',actor:'creator@test.invalid'}));
 const body={items,summary:{total:500,pendingReview:500,awaitingRetest:0,capaPromotion:0,retest:500,failedRetest:0,retestError:0,completed:0,rejected:0},coverage:{loaded:500,complete:false},nextCursor:JSON.stringify([0,items[499].updatedAt,'W-499'])};
 assert.equal(validAssuranceQueue(body),true);
 for(const nextCursor of [null,23,'{}','[0,"wrong","W-499"]','[0,"2026-10-08T00:00:00Z","W-498"]'])assert.equal(validAssuranceQueue({...body,nextCursor}),false);
 assert.equal(validAssuranceQueue({...body,coverage:{loaded:500,complete:true}}),false);
 assert.equal(validAssuranceQueue({...body,coverage:{loaded:500,complete:true},nextCursor:null}),true);
});

test('in-range but contradictory counters are rejected for every summary category',()=>{
 const item={id:'W',findingId:'F',ruleId:'R',action:'control-retest',status:'pending-review',findingTitle:'Finding',severity:'high',owner:'',dueDate:'',ruleName:'Rule',controlRefs:'',updatedAt:'',actor:'creator@test.invalid'};
 const summary={total:1,pendingReview:1,awaitingRetest:0,capaPromotion:0,retest:1,failedRetest:0,retestError:0,completed:0,rejected:0};
 assert.equal(validAssuranceQueue({items:[item],summary}),true);
 for(const [key,value] of Object.entries(summary))assert.equal(validAssuranceQueue({items:[item],summary:{...summary,[key]:value?0:1}}),false,key);
 assert.equal(validAssuranceQueue({items:[{...item,status:'completed'}],summary}),false);
});

test('independent rejection can retire broken source work without enabling approval',()=>{
 for(const sourceState of ['missing-finding','missing-rule','rule-mismatch','unavailable'] as const){
  const item={status:'pending-review',actor:'creator@example.test',sourceState};
  assert.equal(canStartAssuranceReview('Admin','reviewer@example.test',item,'approve'),false);
  assert.equal(canStartAssuranceReview('Admin','reviewer@example.test',item,'reject'),true);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject',''),false);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','          '),false);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','123456789'),false);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','1234567890'),true);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','x'.repeat(1200)),true);
  assert.equal(canReviewAssuranceWork('Admin','reviewer@example.test',item,'reject','x'.repeat(1201)),false);
  for(const role of ['Editor','Viewer','Unknown'])assert.equal(canStartAssuranceReview(role,'reviewer@example.test',item,'reject'),false);
  for(const email of ['', ' CREATOR@example.test '])assert.equal(canStartAssuranceReview('Admin',email,item,'reject'),false);
  assert.equal(canStartAssuranceReview('Admin','reviewer@example.test',{...item,actor:''},'reject'),false);
  for(const status of ['completed','rejected','approved-awaiting-retest','failed-retest','retest-error']){
   assert.equal(canStartAssuranceReview('Admin','reviewer@example.test',{...item,status},'reject'),false);
  }
 }
});
