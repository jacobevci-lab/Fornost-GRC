import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAssuranceQueueSearch} from '../app/assurance-queue-search';
test('search validates length, locale and controls without stripping meaningful punctuation',()=>{
 assert.deepEqual(parseAssuranceQueueSearch('  100%_literal  ','tr'),{query:'100%_literal',lang:'tr'});
 for(const [query,lang] of [['x'.repeat(201),'en'],['hello\nworld','en'],['hello','xx']])assert.throws(()=>parseAssuranceQueueSearch(query,lang));
 assert.deepEqual(parseAssuranceQueueSearch('','en'),{query:'',lang:'en'});
});
