import assert from 'node:assert/strict';
import test from 'node:test';
import {canReviewAssuranceWork,validAssuranceQueue} from '../app/assurance-queue-access';
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
