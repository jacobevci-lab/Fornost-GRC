/** Conditional writes protect lifecycle decisions from retirement and stale reads. */
export async function applyAiModelDecision(db: D1Database, input: {
  id: string; status: 'approved' | 'suspended'; expectedUpdatedAt: string; note: string; actor: string;
}) {
  const existing = await db.prepare('SELECT status,risk_tier,control_maturity,updated_at FROM ai_model_inventory WHERE id=?').bind(input.id).first<Record<string,unknown>>();
  if (!existing) return { status: 404, error: 'Model kaydı bulunamadı.' };
  if (existing.status === 'retired') return { status: 409, error: 'Emekli model yeniden onaylanamaz veya askıya alınamaz. Yeni bir model kaydı oluşturun.' };
  if (!['draft','approved','suspended'].includes(String(existing.status))) return { status: 409, error: 'Model yaşam döngüsü durumu geçersiz.' };
  if (!input.expectedUpdatedAt || existing.updated_at !== input.expectedUpdatedAt) return { status: 409, error: 'Model değişti. Güncel kaydı inceleyip kararınızı yeniden verin.' };
  if (existing.status === input.status) return { status: 409, error: 'Model zaten bu durumda.' };
  if (input.status === 'approved' && existing.risk_tier === 'Critical' && Number(existing.control_maturity) < 4)
    return { status: 409, error: 'Kritik riskli model, kontrol olgunluğu en az 4 olmadan onaylanamaz.' };
  const previousTime = Date.parse(input.expectedUpdatedAt);
  if (!Number.isFinite(previousTime)) return { status: 409, error: 'Model sürümü doğrulanamadı. Kaydı yeniden yükleyin.' };
  const now = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
  const result = await db.prepare(`UPDATE ai_model_inventory SET status=?,approved_by=?,approved_at=?,decision_note=?,updated_by=?,updated_at=?
    WHERE id=? AND status=? AND status IN ('draft','approved','suspended') AND updated_at=?
    AND risk_tier=? AND control_maturity=?
    AND (? <> 'approved' OR risk_tier <> 'Critical' OR control_maturity >= 4)`)
    .bind(input.status,input.status==='approved'?input.actor:null,input.status==='approved'?now:null,input.note,input.actor,now,
      input.id,existing.status,input.expectedUpdatedAt,existing.risk_tier,existing.control_maturity,input.status).run();
  if (Number(result.meta?.changes || 0) !== 1) return { status: 409, error: 'Model işlem sırasında değişti. Güncel kaydı inceleyip tekrar deneyin.' };
  return { status: 200, updatedAt: now };
}
