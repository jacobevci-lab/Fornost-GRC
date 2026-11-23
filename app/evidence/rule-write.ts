import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from '../core-reference-write';

import {reviewerGuard} from "./connector-governance";
export function reviewPolicyStatements(db:D1Database,input:RuleInput){
 return input.reviewer?[db.prepare("INSERT INTO evidence_rule_review_policy(rule_id,reviewer) SELECT id,? FROM evidence_automation_rules WHERE id=?").bind(input.reviewer,input.id)]:[];
}
export type RuleInput={
 id:string;name:string;sourceId:string;controlRefs:string;jsonPath:string;operator:string;expected:string;schedule:string;
 now:string;actor:string;freshnessHours:number;failureThreshold:number;autoFinding:boolean;owner:string;
 remediationDueDays:number;nextRunAt:string|null;reviewer?:string;templateId?:string;templateVersion?:number;
};

/** Validate canonical targets inside the INSERT so deletion cannot race rule creation. */
export function ruleInsert(db:D1Database,input:RuleInput,extra={sql:"1",values:[] as unknown[]}){
 const guard=coreReferenceGuard(canonicalCoreReferenceValues(input.controlRefs).map(value=>({
  sourceId:input.id,field:'control_refs',value,modules:['Kontroller','Uyum'],
 })));
 if(input.reviewer){const review=reviewerGuard(input.reviewer,input.owner,input.actor);guard.sql+=' AND '+review.sql;guard.values.push(...review.values)}
 return db.prepare(`INSERT INTO evidence_automation_rules(
 id,name,source_id,control_refs,json_path,operator,expected,schedule,enabled,created_at,updated_at,updated_by,
 freshness_hours,failure_threshold,consecutive_failures,auto_finding,remediation_owner,remediation_due_days,next_run_at,template_id,template_version)
 SELECT ?,?,?,?,?,?,?,?,1,?,?,?,?,?,0,?,?,?,?,?,? WHERE ${guard.sql} AND ${extra.sql}`)
 .bind(input.id,input.name,input.sourceId,input.controlRefs,input.jsonPath,input.operator,input.expected,input.schedule,
 input.now,input.now,input.actor,input.freshnessHours,input.failureThreshold,input.autoFinding?1:0,input.owner,
 input.remediationDueDays,input.nextRunAt,input.templateId??null,input.templateVersion??null,...guard.values,...extra.values);
}

export class RuleCreationConflict extends Error {
 constructor(public ruleId=""){super("Kayıt isteği mevcut kontrolle çakışıyor. Mevcut kontrolü inceleyin; tekrar kayıt oluşturulmadı.");}
}
export class InvalidRuleCreationRequest extends Error {}
export function ruleCreationRequestId(value:unknown):string|undefined {
 if(value===undefined)return undefined;
 if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new InvalidRuleCreationRequest("Geçersiz kayıt isteği kimliği.");
 return value.toLowerCase();
}
export async function creationHash(input:RuleInput){
 const content=JSON.stringify([1,input.name,input.sourceId,input.controlRefs,input.jsonPath,input.operator,input.expected,input.schedule,input.freshnessHours,input.failureThreshold,input.autoFinding,input.owner,input.remediationDueDays,input.templateId??null,input.templateVersion??null,...(input.reviewer?[input.reviewer]:[])]);
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** The immutable receipt and rule share one transaction; replay never updates the rule. */
export async function insertAutomationRule(db:D1Database,input:RuleInput,requestId?:string){
 const key=ruleCreationRequestId(requestId);
 if(!key){const [result]=await db.batch([ruleInsert(db,input),...reviewPolicyStatements(db,input)]);if(Number(result.meta?.changes||0)!==1)throw new CoreReferenceUnavailable();return {ruleId:input.id,reused:false};}
 const actor=input.actor.toLowerCase(),hash=await creationHash(input);
 const read=()=>db.prepare(`SELECT receipt.rule_id,receipt.payload_hash,rule.id live_id
 FROM evidence_rule_creation_requests receipt LEFT JOIN evidence_automation_rules rule ON rule.id=receipt.rule_id
 WHERE receipt.actor=? AND receipt.request_id=?`).bind(actor,key).first<{rule_id:string;payload_hash:string;live_id:string|null}>();
 const resolve=(receipt:{rule_id:string;payload_hash:string;live_id:string|null},reused:boolean)=>{
  if(receipt.payload_hash!==hash||!receipt.live_id)throw new RuleCreationConflict(receipt.live_id||'');
  return {ruleId:receipt.rule_id,reused};
 };
 const existing=await read();if(existing)return resolve(existing,true);
 await db.batch([
  ruleInsert(db,input,{sql:`EXISTS(SELECT 1 FROM evidence_automation_sources WHERE id=?) AND NOT EXISTS(SELECT 1 FROM evidence_rule_creation_requests WHERE actor=? AND request_id=?)`,values:[input.sourceId,actor,key]}),
  db.prepare(`INSERT INTO evidence_rule_creation_requests(actor,request_id,payload_hash,rule_id,created_at)
 SELECT ?,?,?,?,? WHERE changes()=1`).bind(actor,key,hash,input.id,input.now),
  ...reviewPolicyStatements(db,input),
 ]);
 const saved=await read();if(!saved)throw new CoreReferenceUnavailable();
 return resolve(saved,saved.rule_id!==input.id);
}
