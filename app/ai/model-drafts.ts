import { unreferencedAiModelSql } from './model-relations';
import { commitAiModelWrite } from './model-audit';
import type { validateAiModel } from './model-inventory';

export async function editAiModelDraft(db:D1Database,input:{id:string;expectedUpdatedAt:string;actor:string;value:ReturnType<typeof validateAiModel>}) {
  const previous=Date.parse(input.expectedUpdatedAt);
  if(!input.expectedUpdatedAt||!Number.isFinite(previous))return {status:409,error:'Model sürümü eksik veya geçersiz. Güncel kaydı yeniden açın.'};
  const now=new Date(Math.max(Date.now(),previous+1)).toISOString(),v=input.value;
  const write=db.prepare(`UPDATE ai_model_inventory SET system_name=?,model_name=?,vendor=?,purpose=?,owner=?,deployment=?,region=?,data_classification=?,autonomy=?,affected_users=?,impact=?,likelihood=?,data_sensitivity=?,autonomy_risk=?,control_maturity=?,inherent_score=?,residual_score=?,risk_tier=?,controls=?,review_date=?,updated_by=?,updated_at=? WHERE id=? AND status='draft' AND updated_at=?`)
    .bind(v.systemName,v.modelName,v.vendor,v.purpose,v.owner,v.deployment,v.region,v.dataClassification,v.autonomy,v.affectedUsers,v.impact,v.likelihood,v.dataSensitivity,v.autonomyRisk,v.controlMaturity,v.inherentScore,v.residualScore,v.riskTier,v.controls,v.reviewDate,input.actor,now,input.id,input.expectedUpdatedAt);
  if(!await commitAiModelWrite(db,write,{id:input.id,actor:input.actor,action:'model-inventory-edit',detail:`${input.id} rescored ${v.riskTier} (${v.residualScore})`,at:now}))return {status:409,error:'Model değişti veya artık taslak değil. Güncel kaydı yeniden açın.'};
  return {status:200,updatedAt:now};
}

export async function deleteAiModelDraft(db:D1Database,input:{id:string;expectedUpdatedAt:string;actor:string}) {
  if(!input.expectedUpdatedAt||!Number.isFinite(Date.parse(input.expectedUpdatedAt)))return {status:409,error:'Model sürümü eksik veya geçersiz. Güncel kaydı yeniden açın.'};
  const write=db.prepare(`DELETE FROM ai_model_inventory WHERE id=? AND status='draft' AND updated_at=? AND ${unreferencedAiModelSql}`).bind(input.id,input.expectedUpdatedAt);
  if(!await commitAiModelWrite(db,write,{id:input.id,actor:input.actor,action:'model-inventory-delete',detail:`${input.id} deleted`,at:new Date().toISOString()}))return {status:409,error:'Model değişti, artık taslak değil veya bağlı kayıtları var. Bağlı bulgu, kanıt ve geçmişi korumak için emeklilik sürecini kullanın.'};
  return {status:200};
}

export async function createAiModel(db:D1Database,v:ReturnType<typeof validateAiModel>,actor:string){
 const id=`AIM-${crypto.randomUUID()}`,now=new Date().toISOString();
 const write=db.prepare(`INSERT INTO ai_model_inventory(id,system_name,model_name,vendor,purpose,owner,deployment,region,data_classification,autonomy,affected_users,impact,likelihood,data_sensitivity,autonomy_risk,control_maturity,inherent_score,residual_score,risk_tier,controls,status,review_date,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,v.systemName,v.modelName,v.vendor,v.purpose,v.owner,v.deployment,v.region,v.dataClassification,v.autonomy,v.affectedUsers,v.impact,v.likelihood,v.dataSensitivity,v.autonomyRisk,v.controlMaturity,v.inherentScore,v.residualScore,v.riskTier,v.controls,"draft",v.reviewDate,actor,now,actor,now);
 if(!await commitAiModelWrite(db,write,{id,actor,action:'model-inventory-create',detail:`${id} created; residual risk ${v.riskTier} (${v.residualScore})`,at:now}))throw new Error('Model creation did not write a row');
 return {id,riskTier:v.riskTier,residualScore:v.residualScore};
}
