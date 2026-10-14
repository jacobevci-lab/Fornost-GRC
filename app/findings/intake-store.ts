import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from '../core-reference-write';
import {lifecycleInsert} from '../enterprise-lifecycle-write';
import {validateFinding} from './domain';

/** The audit receipt, not trigger-inclusive source metadata, identifies a committed intake. */
export async function insertFinding(db:D1Database,finding:ReturnType<typeof validateFinding>,context:{id:string;code:string;actor:string;stamp:string}){
 const {id,code,actor,stamp}=context;
 const guard=coreReferenceGuard([
  {field:'control_ref',value:finding.controlRef,modules:['Kontroller','Uyum']},
  {field:'risk_ref',value:finding.riskRef,modules:['Risk Assessment']},
 ].flatMap(({field,value,modules})=>canonicalCoreReferenceValues(value).map(value=>({sourceId:id,field,value,modules}))));
 const results=await db.batch([
  db.prepare(`INSERT INTO enterprise_findings(id,code,source_type,source_ref,source_title,finding_type,title,description,severity,owner,reviewer,root_cause,corrective_action,preventive_action,due_date,status,risk_ref,control_ref,detected_by,detected_at,updated_by,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,? WHERE ${guard.sql}`)
   .bind(id,code,finding.sourceType,finding.sourceRef,finding.sourceTitle,finding.findingType,finding.title,finding.description,finding.severity,finding.owner,finding.reviewer,finding.rootCause,finding.correctiveAction,finding.preventiveAction,finding.dueDate,finding.riskRef||null,finding.controlRef||null,actor,stamp,actor,stamp,...guard.values),
  lifecycleInsert(db,'enterprise_finding_events',{id:crypto.randomUUID(),finding_id:id,action:'finding-create',from_status:null,to_status:'open',detail:`${code}; ${finding.sourceType}/${finding.sourceRef}; ${finding.severity}; due ${finding.dueDate}`,evidence_reference:null,evidence_sha256:null,actor,created_at:stamp}),
 ]);
 if(Number(results[1]?.meta?.changes||0)!==1)throw new CoreReferenceUnavailable();
}
