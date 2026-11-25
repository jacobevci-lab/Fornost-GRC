import {withBasePath} from './base-path';
import type {CapaWorkItem,EnterpriseFindingSnapshot} from './continuous-assurance-attention-state';
export type TraceabilityItem={workItemId:string;findingId:string;resultRef:string;completedAt:string;enterpriseFinding:EnterpriseFindingSnapshot|null};
const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=120&&value.trim()===value&&!/\p{Cc}/u.test(value);
/** Resolve precisely the governed work currently displayed, even beyond the legacy 500-row window. */
export async function loadCapaTraceability(work:CapaWorkItem[],fetcher:typeof fetch=fetch):Promise<TraceabilityItem[]> {
 const completed=work.filter(item=>item.action==='capa-promotion'&&item.status==='completed');
 if(completed.length>500||completed.some(item=>!identity(item.id)||!identity(item.findingId)||!identity(item.resultRef))||new Set(completed.map(item=>item.id)).size!==completed.length)throw new Error('Invalid CAPA work identities');
 const results:TraceabilityItem[]=[];
 // At most ten bounded requests; concurrent batches keep source latency bounded.
 const batches=Array.from({length:Math.ceil(completed.length/50)},(_,i)=>completed.slice(i*50,i*50+50));
 const pages=await Promise.all(batches.map(async batch=>{
  const response=await fetcher(withBasePath('/api/continuous-assurance/traceability?'+new URLSearchParams({workIds:JSON.stringify(batch.map(item=>item.id))})),{cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('CAPA lifecycle unavailable');
  const body=await response.json();
  if(!body||body.available!==true||!Array.isArray(body.items)||body.items.length!==batch.length||body.coverage?.complete!==true||body.coverage?.loaded!==body.items.length)throw new Error('Incomplete CAPA lifecycle');
  const requested=new Map(batch.map(item=>[item.id,item])),seen=new Set<string>();
  for(const item of body.items){
   const source=item&&requested.get(item.workItemId);
   if(!source||seen.has(item.workItemId)||item.findingId!==source.findingId||item.resultRef!==source.resultRef||typeof item.completedAt!=='string')throw new Error('CAPA lifecycle changed');
   seen.add(item.workItemId);
   const finding=item.enterpriseFinding;
   if(finding!==null&&(!finding||finding.id!==source.resultRef||!['open','in-progress','verification','closed','accepted'].includes(finding.status)||typeof finding.code!=='string'||typeof finding.evidenceReference!=='string'||typeof finding.verificationEvidenceReference!=='string'||!Number.isSafeInteger(finding.recurrenceCount)||finding.recurrenceCount<0))throw new Error('Invalid CAPA lifecycle');
  }
  return body.items as TraceabilityItem[];
 }));
 for(const page of pages)results.push(...page);
 return results;
}
