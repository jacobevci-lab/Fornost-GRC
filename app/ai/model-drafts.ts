import type { validateAiModel } from './model-inventory';

export async function editAiModelDraft(db:D1Database,input:{id:string;expectedUpdatedAt:string;actor:string;value:ReturnType<typeof validateAiModel>}) {
  const previous=Date.parse(input.expectedUpdatedAt);
  if(!input.expectedUpdatedAt||!Number.isFinite(previous))return {status:409,error:'Model sürümü eksik veya geçersiz. Güncel kaydı yeniden açın.'};
  const now=new Date(Math.max(Date.now(),previous+1)).toISOString(),v=input.value;
  const result=await db.prepare(`UPDATE ai_model_inventory SET system_name=?,model_name=?,vendor=?,purpose=?,owner=?,deployment=?,region=?,data_classification=?,autonomy=?,affected_users=?,impact=?,likelihood=?,data_sensitivity=?,autonomy_risk=?,control_maturity=?,inherent_score=?,residual_score=?,risk_tier=?,controls=?,review_date=?,updated_by=?,updated_at=? WHERE id=? AND status='draft' AND updated_at=?`)
    .bind(v.systemName,v.modelName,v.vendor,v.purpose,v.owner,v.deployment,v.region,v.dataClassification,v.autonomy,v.affectedUsers,v.impact,v.likelihood,v.dataSensitivity,v.autonomyRisk,v.controlMaturity,v.inherentScore,v.residualScore,v.riskTier,v.controls,v.reviewDate,input.actor,now,input.id,input.expectedUpdatedAt).run();
  if(Number(result.meta?.changes||0)!==1)return {status:409,error:'Model değişti veya artık taslak değil. Güncel kaydı yeniden açın.'};
  return {status:200,updatedAt:now};
}

export async function deleteAiModelDraft(db:D1Database,input:{id:string;expectedUpdatedAt:string}) {
  if(!input.expectedUpdatedAt||!Number.isFinite(Date.parse(input.expectedUpdatedAt)))return {status:409,error:'Model sürümü eksik veya geçersiz. Güncel kaydı yeniden açın.'};
  const result=await db.prepare("DELETE FROM ai_model_inventory WHERE id=? AND status='draft' AND updated_at=?").bind(input.id,input.expectedUpdatedAt).run();
  if(Number(result.meta?.changes||0)!==1)return {status:409,error:'Model değişti veya artık taslak değil. Güncel kaydı incelemeden silinemez.'};
  return {status:200};
}
