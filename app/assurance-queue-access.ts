import {assuranceQueueSummary} from "./assurance-queue-summary";
import {assuranceQueueCursor,parseAssuranceQueueCursor} from "./assurance-queue-cursor";
export function canReviewAssuranceWork(role:string,email:string,item:{status:string;actor:string},decision:'approve'|'reject',note:string) {
 const identity=email.trim().toLowerCase(),requester=item.actor.trim().toLowerCase();
 return role==='Admin'&&!!identity&&!!requester&&identity!==requester&&item.status==='pending-review'&&(decision==='approve'||note.trim().length>=10)&&note.trim().length<=1200;
}
export function validAssuranceQueue(body:Record<string,unknown>):boolean {
 const required=['id','findingId','ruleId','action','status','findingTitle','severity','owner','dueDate','ruleName','controlRefs','updatedAt','actor'];
 const optional=['targetControlRef','createdAt','reviewedBy','reviewedAt','reviewNote','resultRef','resultCode','completedAt'];
 if(!Array.isArray(body.items)||body.items.length>500)return false;
 const ids=new Set<string>();
 if(!body.items.every(row=>{
  if(!row||typeof row!=='object'||!required.every(key=>typeof row[key]==='string')||!optional.every(key=>row[key]==null||typeof row[key]==='string'))return false;
  const id=row.id.trim();if(!id||id!==row.id||ids.has(id))return false;ids.add(id);return true;
 }))return false;
 const expected=assuranceQueueSummary(body.items);
 const summary=body.summary as Record<string,unknown>|undefined;
 if(!summary||typeof summary!=='object'||!Object.entries(expected).every(([key,value])=>summary[key]===value))return false;
 if(body.coverage!==undefined){
  const coverage=body.coverage as Record<string,unknown>|null;
  if(!coverage||typeof coverage!=='object'||coverage.loaded!==body.items.length||typeof coverage.complete!=='boolean')return false;
  if(!coverage.complete&&body.items.length!==500)return false;
 }
 if(body.nextCursor!==undefined){
  if(body.nextCursor!==null){
   if(typeof body.nextCursor!=='string')return false;
   try{parseAssuranceQueueCursor(body.nextCursor);}catch{return false;}
   const last=body.items.at(-1);
   if(!last||body.nextCursor!==assuranceQueueCursor({id:last.id,status:last.status,updated_at:last.updatedAt}))return false;
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
