import test from 'node:test';
import assert from 'node:assert/strict';
import {assuranceQueueSummary} from '../app/assurance-queue-summary';
test('queue summary distinguishes workflow states from pending action subsets',()=>{
 const rows=[
  {action:'capa-promotion',status:'pending-review'},
  {action:'control-retest',status:'pending-review'},
  {action:'control-retest',status:'approved-awaiting-retest'},
  {action:'control-retest',status:'failed-retest'},
  {action:'control-retest',status:'retest-error'},
  {action:'capa-promotion',status:'completed'},
  {action:'capa-promotion',status:'rejected'},
 ];
 assert.deepEqual(assuranceQueueSummary(rows),{total:7,pendingReview:2,awaitingRetest:1,capaPromotion:1,retest:1,failedRetest:1,retestError:1,completed:1,rejected:1});
 const reviewed=rows.map((row,index)=>index===1?{...row,status:'approved-awaiting-retest'}:row);
 assert.deepEqual(assuranceQueueSummary(reviewed),{total:7,pendingReview:1,awaitingRetest:2,capaPromotion:1,retest:0,failedRetest:1,retestError:1,completed:1,rejected:1});
 assert.equal(assuranceQueueSummary(rows.slice(5)).completed,1);
});
