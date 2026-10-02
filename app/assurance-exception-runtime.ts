import { findRiskRecord, riskObject, RiskReviewError } from './risk-review-runtime';

export type ExceptionRow = {
  id:string; finding_id:string; rule_id:string; control_ref:string; risk_ref:string; reason:string;
  expires_at:string; evidence_reference:string; evidence_sha256:string; status:string;
  submitted_by:string; submitted_at:string; reviewed_by:string|null; reviewed_at:string|null;
  review_note:string|null; revoked_by:string|null; revoked_at:string|null; retest_required:number|null;
  retest_work_item_id:string|null; lifecycle_updated_at:string|null; lifecycle_token:string;
};
type Transition = 'approve'|'reject'|'revoke'|'expire';
const snapshotFields = ['status','finding_id','rule_id','control_ref','risk_ref','reason','expires_at','evidence_reference','evidence_sha256','submitted_by','submitted_at','reviewed_by','reviewed_at','review_note','revoked_by','revoked_at','retest_required','retest_work_item_id','lifecycle_updated_at','lifecycle_token'] as const;
const sameActor = (a:string,b:string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A private claim token gates every side effect inside the same D1 transaction. */
export async function transitionAssuranceException(db:D1Database,id:string,action:Transition,actor:string,note='',now=new Date()) {
  const row=await db.prepare('SELECT * FROM continuous_assurance_exceptions WHERE id=?').bind(id).first<ExceptionRow>();
  if(!row) throw new RiskReviewError('Exception bulunamadı.',404);
  const ending=action==='revoke'||action==='expire', stamp=now.toISOString(), day=stamp.slice(0,10);
  if(row.status!==(ending?'active':'pending-review')) throw new RiskReviewError('Exception başka bir işlemde değişti; listeyi yenileyin.');
  if(action!=='expire'&&sameActor(row.submitted_by,actor)) throw new RiskReviewError('Maker-checker: exception talebini oluşturan kişi onaylayamaz veya geri alamaz.');
  if((action==='reject'||action==='revoke')&&note.trim().length<10) throw new RiskReviewError('Karar gerekçesi en az 10 karakter olmalıdır.',400);
  if(action==='approve'&&row.expires_at<day) throw new RiskReviewError('Süresi geçmiş exception onaylanamaz; yeni bir talep oluşturun.');
  if(action==='expire'&&row.expires_at>=day) throw new RiskReviewError('Exception henüz sona ermedi.');
  const risk=action==='reject'?null:await findRiskRecord(db,row.risk_ref);
  if(action==='approve'&&row.risk_ref&&!risk) throw new RiskReviewError('Bağlı risk bulunamadı; talebi reddedip doğru riskle yeniden oluşturun.');
  const data=risk?riskObject(risk.data_json):null;
  if(risk&&!data) throw new RiskReviewError('Bağlı risk verisi okunamadı; karar kaydedilmedi.');
  const status=action==='approve'?'active':action==='reject'?'rejected':action==='revoke'?'revoked':'expired';
  if(data){
    if(!ending){data.assuranceExceptionStatus='active';data.assuranceExceptionRef=id;data.assuranceExceptionExpiresAt=row.expires_at;data.assuranceExceptionReason=row.reason;}
    else {
      // An older exception must not erase the summary of a newer active exception.
      if(!data.assuranceExceptionRef||data.assuranceExceptionRef===id){data.assuranceExceptionStatus=status;data.assuranceExceptionRef=id;}
      data.residualRiskReviewRequired=true;data.riskReviewRequestedAt=String(data.riskReviewRequestedAt||'').trim()||stamp;
      data.riskReviewEscalationState='none';data.reassessmentReason=`Assurance exception ${status}; mandatory control re-test and risk-owner reassessment are required.`;
      data.reassessmentSource='Continuous Assurance · Exception Lifecycle';
    }
  }
  const token=crypto.randomUUID();
  const guard=`id=? AND ${snapshotFields.map(field=>`${field} IS ?`).join(' AND ')}${risk?" AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment' AND data_json=? AND updated_at=?)":''}`;
  const guardArgs=[id,...snapshotFields.map(field=>row[field]??null),...(risk?[risk.id,risk.data_json,risk.updated_at]:[])];
  const claimed="EXISTS(SELECT 1 FROM continuous_assurance_exceptions WHERE id=? AND lifecycle_token=?)";
  const decisionNote=note.trim().slice(0,1200)||(action==='approve'?'Assurance exception approved.':row.review_note);
  const statements=[db.prepare(`UPDATE continuous_assurance_exceptions SET status=?,reviewed_by=?,reviewed_at=?,review_note=?,revoked_by=?,revoked_at=?,retest_required=?,retest_work_item_id=NULL,lifecycle_updated_at=?,lifecycle_token=? WHERE ${guard}`)
    .bind(status,ending?row.reviewed_by:actor,ending?row.reviewed_at:stamp,decisionNote,action==='revoke'?actor:row.revoked_by,action==='revoke'?stamp:row.revoked_at,ending?1:0,stamp,token,...guardArgs)];
  if(ending&&row.finding_id&&row.rule_id){
    const workId=`CAW-${crypto.randomUUID()}`,decision={source:'assurance-exception',exceptionId:id,lifecycleReason:status,mandatory:true,controlRef:row.control_ref,riskRef:risk?.id||row.risk_ref||row.finding_id};
    const pending="finding_id=? AND rule_id=? AND action='control-retest' AND status IN ('pending-review','approved-awaiting-retest')";
    statements.push(db.prepare(`INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor) SELECT ?,?,?,'control-retest','pending-review',?,?,?,? WHERE ${claimed} AND NOT EXISTS(SELECT 1 FROM continuous_assurance_work_items WHERE ${pending})`)
      .bind(workId,row.finding_id,row.rule_id,JSON.stringify(decision),stamp,stamp,actor,id,token,row.finding_id,row.rule_id));
    statements.push(db.prepare(`UPDATE continuous_assurance_exceptions SET retest_work_item_id=(SELECT id FROM continuous_assurance_work_items WHERE ${pending} ORDER BY created_at DESC,id LIMIT 1) WHERE id=? AND lifecycle_token=?`)
      .bind(row.finding_id,row.rule_id,id,token));
  }
  if(risk&&data) statements.push(db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module='Risk Assessment' AND ${claimed}`).bind(JSON.stringify(data),stamp,risk.id,id,token));
  const result=await db.batch(statements);
  if(!result[0]?.meta?.changes) throw new RiskReviewError('Risk veya exception başka bir işlemde değişti; listeyi yenileyip tekrar deneyin.');
  const saved=await db.prepare('SELECT retest_work_item_id FROM continuous_assurance_exceptions WHERE id=?').bind(id).first<{retest_work_item_id:string|null}>();
  return {status,retestWorkItemId:saved?.retest_work_item_id||''};
}

export async function reconcileExpiredExceptions(db:D1Database,now=new Date()) {
  const rows=await db.prepare("SELECT id FROM continuous_assurance_exceptions WHERE status='active' AND expires_at<? ORDER BY expires_at,id LIMIT 200").bind(now.toISOString().slice(0,10)).all<{id:string}>();
  let completed=0;
  for(const row of rows.results){
    try{await transitionAssuranceException(db,row.id,'expire','system:exception-lifecycle','',now);completed++;}
    catch(error){if(!(error instanceof RiskReviewError&&error.status===409))throw error;}
  }
  return completed;
}
