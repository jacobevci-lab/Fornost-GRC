import {readAssuranceQueue,ASSURANCE_QUEUE_LIMIT} from './assurance-queue-register';
import {assuranceQueueCursor} from './assurance-queue-cursor';
import {needsAssuranceAttention,ASSURANCE_ATTENTION_SCAN_LIMIT} from './assurance-queue-attention';
import type {AssuranceSourceState,AssuranceQueueContext} from './assurance-queue-context';
import type {AssuranceQueueSearch} from './assurance-queue-search';
type AttentionRow={id:string;status:string;updated_at:string;action:string;created_at:string;finding_severity?:string|null;source_state:AssuranceSourceState};
// Bound each request's database work. The cursor follows the last examined row,
// including healthy rows, so an empty partial result can still advance safely.
export async function readAssuranceAttention<T extends AttentionRow>(db:D1Database,at:Date,cursor?:string,search?:AssuranceQueueSearch){
 const rows:T[]=[];let scanned=0,nextCursor:string|null=cursor??null,context:AssuranceQueueContext|undefined;
 do{
  const page=await readAssuranceQueue<T>(db,nextCursor??undefined,search,'active');
  if(context!==undefined&&context!==page.context)throw new Error('Assurance context changed; refresh');
  context=page.context;
  for(let index=0;index<page.rows.length;index++){
   const row=page.rows[index];scanned++;
   if(needsAssuranceAttention({status:row.status,action:row.action,createdAt:row.created_at,severity:row.finding_severity??'',sourceState:row.source_state},at))rows.push(row);
   nextCursor=index<page.rows.length-1||page.nextCursor!==null?assuranceQueueCursor(row):null;
   if(rows.length===ASSURANCE_QUEUE_LIMIT||scanned===ASSURANCE_ATTENTION_SCAN_LIMIT)break;
  }
  if(!page.rows.length)nextCursor=null;
 }while(nextCursor&&rows.length<ASSURANCE_QUEUE_LIMIT&&scanned<ASSURANCE_ATTENTION_SCAN_LIMIT);
 return {rows,nextCursor,context:context!,assessmentAt:at.toISOString(),scanned,coverage:{loaded:rows.length,complete:nextCursor===null}};
}
