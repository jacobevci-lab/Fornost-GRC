import {assuranceSourceReady,validAssuranceSourceState,validAssuranceQueueContext,type AssuranceSourceState} from "./assurance-queue-context";
import {assuranceQueueSummary} from "./assurance-queue-summary";
import {assuranceQueueCursor,parseAssuranceQueueCursor} from "./assurance-queue-cursor";
import {needsAssuranceAttention,validAssuranceAssessment,ASSURANCE_ATTENTION_SCAN_LIMIT} from "./assurance-queue-attention";
import {parseAssuranceQueueFilter} from "./assurance-queue-filter";
type ReviewItem={status:string;actor:string;sourceState?:AssuranceSourceState};
export function canStartAssuranceReview(role:string,email:string,item:ReviewItem,decision:'approve'|'reject') {
 const identity=email.trim().toLowerCase(),requester=item.actor.trim().toLowerCase();
 return (decision==='reject'||assuranceSourceReady(item))&&role==='Admin'&&!!identity&&!!requester&&identity!==requester&&item.status==='pending-review';
}
export function canReviewAssuranceWork(role:string,email:string,item:ReviewItem,decision:'approve'|'reject',note:string) {
 return canStartAssuranceReview(role,email,item,decision)&&(decision==='approve'||note.trim().length>=10)&&note.trim().length<=1200;
}
export function validAssuranceQueue(body:Record<string,unknown>):boolean {
 if(body.filter!==undefined){try{parseAssuranceQueueFilter(body.filter as string);}catch{return false;}}
 const attention=body.filter==='attention';
 if(attention&&(!validAssuranceAssessment(body.assessmentAt)||!Number.isInteger(body.scanned)||(body.scanned as number)<0||(body.scanned as number)>ASSURANCE_ATTENTION_SCAN_LIMIT||body.nextCursor===undefined||body.coverage===undefined))return false;
 if(body.context!==undefined&&!validAssuranceQueueContext(body.context))return false;
 const required=['id','findingId','ruleId','action','status','findingTitle','severity','owner','dueDate','ruleName','controlRefs','updatedAt','actor'];
 const optional=['targetControlRef','createdAt','reviewedBy','reviewedAt','reviewNote','resultRef','resultCode','completedAt'];
 if(!Array.isArray(body.items)||body.items.length>500)return false;
 const ids=new Set<string>();
 if(!body.items.every(row=>{
  if(!row||typeof row!=='object'||!required.every(key=>typeof row[key]==='string')||!optional.every(key=>row[key]==null||typeof row[key]==='string'))return false;
  if(row.sourceState!==undefined&&!validAssuranceSourceState(row.sourceState))return false;
  const id=row.id.trim();if(!id||id!==row.id||ids.has(id))return false;ids.add(id);return true;
 }))return false;
 if(attention&&((body.scanned as number)<body.items.length||!body.items.every(row=>needsAssuranceAttention(row,new Date(body.assessmentAt as string)))))return false;
 const expected=assuranceQueueSummary(body.items);
 const summary=body.summary as Record<string,unknown>|undefined;
 if(!summary||typeof summary!=='object'||!Object.entries(expected).every(([key,value])=>summary[key]===value))return false;
 if(body.coverage!==undefined){
  const coverage=body.coverage as Record<string,unknown>|null;
  if(!coverage||typeof coverage!=='object'||coverage.loaded!==body.items.length||typeof coverage.complete!=='boolean')return false;
  if(!coverage.complete&&(attention?(body.scanned as number)<1:body.items.length!==500))return false;
 }
 if(body.nextCursor!==undefined){
  if(body.nextCursor!==null){
   if(typeof body.nextCursor!=='string')return false;
   try{parseAssuranceQueueCursor(body.nextCursor);}catch{return false;}
   const last=body.items.at(-1);
   if(!attention&&(!last||body.nextCursor!==assuranceQueueCursor({id:last.id,status:last.status,updated_at:last.updatedAt})))return false;
  }
  const coverage=body.coverage as {complete?:unknown}|undefined;
  if(!coverage||coverage.complete!==(body.nextCursor===null))return false;
 }
 return true;
}
// Older servers cannot distinguish an exactly-full list from a truncated list.
export function assuranceQueueComplete(body:Record<string,unknown>):boolean {
 if(!validAssuranceQueue(body))return false;
 return body.coverage!==undefined?(body.coverage as {complete:boolean}).complete:(body.items as unknown[]).length<500;
}
