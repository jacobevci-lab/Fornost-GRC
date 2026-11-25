import test from 'node:test';
import assert from 'node:assert/strict';
import {readAttentionSnapshot} from '../app/assurance-attention-loader';
import {assuranceQueueSummary} from '../app/assurance-queue-summary';
const insights={available:true,state:'healthy',insights:[]};
const automation={sources:[],rules:[],runs:[],findings:[]};
const empty={items:[],summary:assuranceQueueSummary([]),coverage:{loaded:0,complete:true}};
function fetcher(work:unknown=empty,insight:unknown=insights,auto:unknown=automation):typeof fetch{return async(url,init)=>{
 if(init?.signal?.aborted)throw new Error('aborted');
 const path=String(url);return Response.json(path.endsWith('operations-insights')?insight:path.endsWith('evidence-automation')?auto:work);
};}
test('complete empty queue is known empty, while malformed and unavailable queues are unknown',async()=>{
 const signal=new AbortController().signal;
 assert.equal((await readAttentionSnapshot(signal,fetcher())).governanceAvailable,true);
 for(const work of [null,{items:[]},{...empty,summary:{total:999}}]){
  const result=await readAttentionSnapshot(signal,fetcher(work));assert.equal(result.governanceAvailable,false);assert.equal(result.findingLifecycleAvailable,false);assert.deepEqual(result.workItems,[]);
 }
});
test('a valid but truncated queue cannot authorize new work from absent records',async()=>{
 const items=Array.from({length:500},(_,i)=>({id:String(i),findingId:'F'+i,ruleId:'R',action:'control-retest',status:'pending-review',findingTitle:'QA',severity:'high',owner:'QA',dueDate:'',ruleName:'QA',controlRefs:'C',updatedAt:'',actor:'QA'}));
 const result=await readAttentionSnapshot(new AbortController().signal,fetcher({items,summary:assuranceQueueSummary(items),coverage:{loaded:500,complete:false}}));
 assert.equal(result.governanceAvailable,false);assert.deepEqual(result.workItems,[]);
});
test('invalid insight and automation bodies never become an all-clear state',async()=>{
 for(const insight of [{},null,{...insights,available:false},{...insights,state:'unknown'},{...insights,insights:[{}]}])await assert.rejects(()=>readAttentionSnapshot(new AbortController().signal,fetcher(empty,insight)));
 for(const auto of [{},null,{...automation,rules:[null]}])await assert.rejects(()=>readAttentionSnapshot(new AbortController().signal,fetcher(empty,insights,auto)));
});
test('cancellation is propagated to every primary request and rejects late completion',async()=>{
 const controller=new AbortController(),signals:AbortSignal[]=[];
 const base=fetcher();const delayed:typeof fetch=async(url,init)=>{signals.push(init!.signal!);const result=await base(url,init);controller.abort();return result;};
 await assert.rejects(()=>readAttentionSnapshot(controller.signal,delayed));assert.equal(signals.length,3);assert.ok(signals.every(s=>s.aborted));
});
