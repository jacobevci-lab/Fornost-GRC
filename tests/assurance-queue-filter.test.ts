import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssuranceQueueFilter,matchesAssuranceQueueFilter} from '../app/assurance-queue-filter';
test('status filter contract accepts only exact supported scopes',()=>{
 for(const filter of ['all','active','review','retest','attention'])assert.equal(parseAssuranceQueueFilter(filter),filter);
 for(const filter of ['', 'Review',' review','completed',"all' OR 1=1"])assert.throws(()=>parseAssuranceQueueFilter(filter));
 assert.equal(matchesAssuranceQueueFilter('pending-review','review'),true);
 assert.equal(matchesAssuranceQueueFilter('completed','active'),false);
 assert.equal(matchesAssuranceQueueFilter('pending-review','retest'),false);
 assert.equal(matchesAssuranceQueueFilter('rejected','all'),true);
});
