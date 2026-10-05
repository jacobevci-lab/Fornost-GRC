import { validateDecommissionAction } from './decommission';
const sameActor=(a:unknown,b:string)=>String(a??'').trim().toLowerCase()===b.trim().toLowerCase();
const snapshotFields=['model_id','replacement_model_id','reason','owner','planned_at','dependencies','stakeholder_plan','rollback_plan','data_disposition','retention_basis','disposal_method','artifact_plan','access_plan','evidence_plan','status','created_by','executed_by','updated_at'] as const;

export async function transitionAiDecommission(db:D1Database,id:string,input:Record<string,unknown>,actor:string,clock=new Date()){
 const action=validateDecommissionAction(input);
 const row=await db.prepare('SELECT * FROM ai_decommission_plans WHERE id=?').bind(id).first<Record<string,unknown>>();
 if(!row)return {code:404,error:'Emeklilik planı bulunamadı.'};
 const expected:Record<string,string>={approve:'draft',reject:'draft',start:'approved',verify:'executing'};
 if(row.status!==expected[action.action]||!input.expectedUpdatedAt||input.expectedUpdatedAt!==row.updated_at)return {code:409,error:'Emeklilik planı değişti. Güncel planı inceleyip tekrar deneyin.'};
 if(action.action==='approve'&&sameActor(row.created_by,actor))return {code:409,error:'Planı oluşturan kişi aynı planı onaylayamaz.'};
 if(action.action==='verify'&&sameActor(row.executed_by,actor))return {code:409,error:'Emeklilik icrasını yapan kişi imha doğrulamasını yapamaz.'};
 if(action.action==='start'&&String(row.planned_at)>clock.toISOString().slice(0,10))return {code:409,error:'Planlanan emeklilik tarihi gelmeden icra başlatılamaz.'};
 const model=action.action==='reject'?null:await db.prepare('SELECT status,updated_at FROM ai_model_inventory WHERE id=?').bind(row.model_id).first<Record<string,unknown>>();
 if(action.action!=='reject'&&(!model||!['draft','approved','suspended'].includes(String(model.status))))return {code:409,error:'Bağlı model etkin değil veya bulunamadı.'};
 const prior=Date.parse(String(row.updated_at)),modelTime=model?Date.parse(String(model.updated_at)):0;
 if(!Number.isFinite(prior)||!Number.isFinite(modelTime))return {code:409,error:'Kayıt sürümü doğrulanamadı. Listeyi yenileyin.'};
 const now=new Date(Math.max(clock.getTime(),prior+1,modelTime+1)).toISOString();
 const status=action.action==='approve'?'approved':action.action==='reject'?'rejected':action.action==='start'?'executing':'completed';
 const guard=`id=? AND ${snapshotFields.map(field=>`${field} IS ?`).join(' AND ')}${model?" AND EXISTS(SELECT 1 FROM ai_model_inventory WHERE id=? AND status=? AND updated_at=?)":''}${model&&row.replacement_model_id?" AND EXISTS(SELECT 1 FROM ai_model_inventory WHERE id=? AND status='approved')":''}`;
 const guardArgs=[id,...snapshotFields.map(field=>row[field]??null),...(model?[row.model_id,model.status,model.updated_at]:[]),...(model&&row.replacement_model_id?[row.replacement_model_id]:[])];
 const statements=[db.prepare(`UPDATE ai_decommission_plans SET status=?,decision_note=?,execution_evidence_ref=?,execution_evidence_sha256=?,verification_evidence_ref=?,verification_evidence_sha256=?,verification_checks_json=?,updated_by=?,updated_at=?,approved_by=?,approved_at=?,executed_by=?,executed_at=?,verified_by=?,verified_at=? WHERE ${guard}`)
  .bind(status,action.note,action.action==='start'?action.evidenceReference:row.execution_evidence_ref,action.action==='start'?action.evidenceSha256:row.execution_evidence_sha256,action.action==='verify'?action.evidenceReference:row.verification_evidence_ref,action.action==='verify'?action.evidenceSha256:row.verification_evidence_sha256,action.action==='verify'?JSON.stringify(action.checks):row.verification_checks_json,actor,now,action.action==='approve'?actor:row.approved_by,action.action==='approve'?now:row.approved_at,action.action==='start'?actor:row.executed_by,action.action==='start'?now:row.executed_at,action.action==='verify'?actor:row.verified_by,action.action==='verify'?now:row.verified_at,...guardArgs)];
 // D1 batch executes these statements sequentially in one transaction. changes()
 // gates each dependent write on this batch's immediately preceding write.
 if(action.action==='verify')statements.push(db.prepare("UPDATE ai_model_inventory SET status='retired',decision_note=?,updated_by=?,updated_at=? WHERE changes()=1 AND id=? AND status IN ('draft','approved','suspended')")
  .bind(`Controlled decommission completed: ${id}`,actor,now,row.model_id));
 statements.push(db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
  SELECT ?,?,?,'','',?,?,'success',0,?,? WHERE changes()=1`)
  .bind(crypto.randomUUID(),actor,`ai-decommission-${action.action}`,['start','verify'].includes(action.action)?action.evidenceSha256:row.execution_evidence_sha256||null,JSON.stringify([row.model_id,id]),`${status}; human-confirmed; separation-of-duties`,now));
 const results=await db.batch(statements);
 if(Number(results[0]?.meta?.changes||0)!==1)return {code:409,error:'Plan, model veya yedek model değişti. Listeyi yenileyip tekrar deneyin.'};
 return {code:200,status,modelRetired:action.action==='verify',updatedAt:now};
}
