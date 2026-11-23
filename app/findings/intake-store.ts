import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from '../core-reference-write';
import {lifecycleInsert,LifecycleConflict} from '../enterprise-lifecycle-write';
import type {WorkflowGuard} from '../workflow-selection';
import {findingReferenceModules} from './record-references';
import {validateFinding} from './domain';

/** The audit receipt, not trigger-inclusive source metadata, identifies a committed intake. */
export async function insertFinding(db:D1Database,finding:ReturnType<typeof validateFinding>,context:{id:string;code:string;actor:string;stamp:string;guard?:WorkflowGuard;selectedIds?:boolean}){
 const {id,code,actor,stamp}=context;
 const links=[
  {field:'control_ref',value:finding.controlRef,modules:findingReferenceModules.controlRef},
  {field:'risk_ref',value:finding.riskRef,modules:findingReferenceModules.riskRef},
 ].filter(link=>link.value);
 const guard=coreReferenceGuard(links.flatMap(({field,value,modules})=>{
  const references=context.selectedIds ? [value.toLowerCase()] : canonicalCoreReferenceValues(value);
  return references.map(value=>({sourceId:id,field,value,modules}));
 }));
 // An old code must not substitute for a selected ID if the record disappears before this insert.
 if(context.selectedIds)for(const link of links){
  guard.sql+=" AND EXISTS (SELECT 1 FROM simple_grc_records WHERE id=? AND module IN (SELECT value FROM json_each(?)))";
  guard.values.push(link.value,JSON.stringify(link.modules));
 }
 const results=await db.batch([
  db.prepare(`INSERT INTO enterprise_findings(id,code,source_type,source_ref,source_title,finding_type,title,description,severity,owner,reviewer,root_cause,corrective_action,preventive_action,due_date,status,risk_ref,control_ref,detected_by,detected_at,updated_by,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,? WHERE (${guard.sql}) AND (${context.guard?.sql||'1'})`)
   .bind(id,code,finding.sourceType,finding.sourceRef,finding.sourceTitle,finding.findingType,finding.title,finding.description,finding.severity,finding.owner,finding.reviewer,finding.rootCause,finding.correctiveAction,finding.preventiveAction,finding.dueDate,finding.riskRef||null,finding.controlRef||null,actor,stamp,actor,stamp,...guard.values,...(context.guard?.values||[])),
  lifecycleInsert(db,'enterprise_finding_events',{id:crypto.randomUUID(),finding_id:id,action:'finding-create',from_status:null,to_status:'open',detail:`${finding.sourceType}/${finding.sourceRef}; ${finding.severity}; due ${finding.dueDate}`,evidence_reference:null,evidence_sha256:null,actor,created_at:stamp}),
 ]);
 if(Number(results[1]?.meta?.changes||0)!==1){
  if(context.guard&&!Number((await db.prepare(`SELECT (${context.guard.sql}) AS valid`).bind(...context.guard.values).first<{valid:number}>())?.valid))throw new LifecycleConflict();
  throw new CoreReferenceUnavailable();
 }
}
