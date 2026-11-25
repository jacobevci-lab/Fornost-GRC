import {withBasePath} from './base-path';
import {assuranceQueueComplete,validAssuranceQueue} from './assurance-queue-access';
import {loadCapaTraceability,type TraceabilityItem} from './capa-traceability-loader';
import type {CapaWorkItem} from './continuous-assurance-attention-state';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export async function readAttentionSnapshot(signal:AbortSignal,fetcher:typeof fetch=fetch){
 const scopedFetch:typeof fetch=(url,init)=>fetcher(url,{...init,signal:init?.signal?AbortSignal.any([signal,init.signal]):signal});
 const read=async(path:string)=>{
  const response=await scopedFetch(withBasePath(path),{cache:'no-store',headers:{accept:'application/json'}});
  if(!response.ok)throw new Error('Attention source unavailable');
  const body:unknown=await response.json();if(!object(body))throw new Error('Invalid attention response');return body;
 };
 const [insights,automation,work]=await Promise.all([
  read('/api/evidence-automation/operations-insights'),read('/api/evidence-automation'),
  read('/api/continuous-assurance').catch(()=>null),
 ]);
 if(insights.available===false||!['healthy','watch','critical','idle'].includes(String(insights.state))||!Array.isArray(insights.insights)||!insights.insights.every(item=>object(item)&&typeof item.sourceId==='string'&&!!item.sourceId&&['healthy','watch','critical','idle'].includes(String(item.state))))throw new Error('Invalid attention insights');
 for(const key of ['sources','rules','runs','findings'])if(!Array.isArray(automation[key])||!(automation[key] as unknown[]).every(object))throw new Error('Invalid automation response');
 const governanceAvailable=!!work&&validAssuranceQueue(work)&&assuranceQueueComplete(work);
 const workItems=governanceAvailable?work!.items as CapaWorkItem[]:[];
 let traceabilityItems:TraceabilityItem[]=[],findingLifecycleAvailable=false;
 if(governanceAvailable){try{traceabilityItems=await loadCapaTraceability(workItems,scopedFetch);findingLifecycleAvailable=true;}catch{ /* Keep operational insight readable, but withhold lifecycle claims. */ }}
 if(signal.aborted)throw new Error('Attention read cancelled');
 return {insights,automation,workItems,governanceAvailable,traceabilityItems,findingLifecycleAvailable};
}
