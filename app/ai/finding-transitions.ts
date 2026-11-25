import type { validateAiFinding,validateFindingAction } from './findings';
const snapshotFields=['id','model_id','domain','source_ref','severity','status','updated_at','submitted_by','submitted_at','evidence_reference','evidence_sha256','verification_evidence_reference','verification_evidence_sha256','verified_by','verified_at','reopened_by','reopened_at'] as const;
/** Commit only the revision and submitter that the route authorized. */
export async function writeAiFindingTransition(db:D1Database,row:Record<string,unknown>,action:ReturnType<typeof validateFindingAction>,next:string,actor:string,expectedUpdatedAt:string){
 const previous=Date.parse(expectedUpdatedAt);
 if(!expectedUpdatedAt||row.updated_at!==expectedUpdatedAt||!Number.isFinite(previous))return {status:409,error:"Bulgu sürümü doğrulanamadı. Güncel kaydı yeniden açın."};
 const now=new Date(Math.max(Date.now(),previous+1)).toISOString(),submittedBy=action.action==="submit"?actor:row.submitted_by,submittedAt=action.action==="submit"?now:row.submitted_at,verifiedBy=action.action==="resolve"?actor:action.action==="reopen"?null:row.verified_by,verifiedAt=action.action==="resolve"?now:action.action==="reopen"?null:row.verified_at,reopenedBy=action.action==="reopen"?actor:row.reopened_by,reopenedAt=action.action==="reopen"?now:row.reopened_at;
 const guard=snapshotFields.map(field=>`${field} IS ?`).join(' AND ')+(action.action==='reopen'?" AND NOT EXISTS(SELECT 1 FROM ai_findings other WHERE other.model_id=? AND other.domain=? AND other.source_ref=? AND other.status!='resolved' AND other.id!=?)":'');
 const statements=[db.prepare(`UPDATE ai_findings SET status=?,action_note=?,evidence_reference=?,evidence_sha256=?,verification_evidence_reference=?,verification_evidence_sha256=?,updated_by=?,updated_at=?,submitted_by=?,submitted_at=?,verified_by=?,verified_at=?,reopened_by=?,reopened_at=? WHERE ${guard}`).bind(next,action.note,action.action==="submit"?action.evidenceReference:row.evidence_reference,action.action==="submit"?action.evidenceSha256:row.evidence_sha256,action.action==="resolve"?action.evidenceReference:row.verification_evidence_reference,action.action==="resolve"?action.evidenceSha256:row.verification_evidence_sha256,actor,now,submittedBy,submittedAt,verifiedBy,verifiedAt,reopenedBy,reopenedAt,...snapshotFields.map(field=>row[field]??null),...(action.action==='reopen'?[row.model_id,row.domain,row.source_ref,row.id]:[])),
 db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
 SELECT ?,?,?,'','',?,?,'success',0,?,? WHERE changes()=1`).bind(crypto.randomUUID(),actor,`ai-finding-${action.action}`,(['submit','resolve'].includes(action.action)?action.evidenceSha256:row.evidence_sha256)||null,JSON.stringify([row.model_id,row.source_ref,row.id]),`${row.severity}; ${row.status}->${next}; separation-of-duties`,now)];
 const results=await db.batch(statements),result=results[0];
 if(Number(result.meta?.changes||0)!==1)return {status:409,error:"Bulgu işlem sırasında değişti. Güncel kaydı inceleyip işlemi yeniden açın."};
 return {status:200,updatedAt:now};
}

/** Create only for a still-active model and a source without an unresolved finding. */
export async function createAiFinding(db:D1Database,value:ReturnType<typeof validateAiFinding>,actor:string){
 const id=`AIF-${crypto.randomUUID()}`,now=new Date().toISOString();
 const results=await db.batch([
  db.prepare(`INSERT INTO ai_findings(id,model_id,domain,source_ref,title,description,root_cause,corrective_action,preventive_action,owner,severity,due_date,status,created_by,created_at,updated_by,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?
   WHERE EXISTS(SELECT 1 FROM ai_model_inventory WHERE id=? AND status!='retired')
   AND NOT EXISTS(SELECT 1 FROM ai_findings WHERE model_id=? AND domain=? AND source_ref=? AND status!='resolved')`)
   .bind(id,value.modelId,value.domain,value.sourceRef,value.title,value.description,value.rootCause,value.correctiveAction,value.preventiveAction,value.owner,value.severity,value.dueDate,actor,now,actor,now,value.modelId,value.modelId,value.domain,value.sourceRef),
  db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
   SELECT ?,?,'ai-finding-create','','',NULL,?,'success',0,?,? WHERE changes()=1`)
   .bind(crypto.randomUUID(),actor,JSON.stringify([value.modelId,value.sourceRef,id]),`${value.domain}; ${value.severity}; due ${value.dueDate}`,now)
 ]);
 if(Number(results[0]?.meta?.changes||0)!==1)return {status:409,error:'Etkin AI modeli bulunamadı veya bu kaynak için çözülmemiş bulgu zaten var.'};
 return {status:201,id};
}
