import { applyApprovedResidualRisk, validateRiskReviewProposal } from './assurance-governance';
import { sha256HexBytes } from './evidence/versioning';

export type RiskRecord = { id: string; data_json: string; updated_at: string; code?: string };
export type RiskReviewRow = { id: string; risk_id: string; status: string; proposal_json: string; submitted_by: string; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null };
export class RiskReviewError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function riskObject(value: string): Record<string, unknown> | null {
  try { const data = JSON.parse(value); return data && typeof data === 'object' && !Array.isArray(data) ? data : null; } catch { return null; }
}
const hash = (value: string) => sha256HexBytes(new TextEncoder().encode(value));
const rating = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
export const riskRevision = (risk:RiskRecord) => hash(`${risk.updated_at}\n${risk.data_json}`);
export function riskDecisionContext(risk: RiskRecord, revision = '') {
  const data = riskObject(risk.data_json);
  if (!data) return null;
  return { revision, id: risk.id, reference: risk.code || String(data.riskId || data.code || risk.id), title: String(data.title || risk.id), owner: String(data.owner || ''), asset: String(data.asset || ''),
    inherentLikelihood: rating(data.inherentLikelihood ?? data.likelihood), inherentImpact: rating(data.inherentImpact ?? data.impact),
    residualLikelihood: rating(data.residualLikelihood), residualImpact: rating(data.residualImpact), assuranceState: String(data.assuranceState || 'unknown'),
    lastAssuranceRunRef: String(data.lastAssuranceRunRef || ''), reason: String(data.reassessmentReason || ''), updatedAt: risk.updated_at };
}

/** IDs take precedence; ambiguous aliases must never select an arbitrary risk. */
export async function findRiskRecord(db: D1Database, reference: string): Promise<RiskRecord | null> {
  const id = reference.trim(); if (!id) return null;
  const exact = await db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Risk Assessment' AND id=?").bind(id).first<RiskRecord>();
  if (exact) return exact;
  const matches = await db.prepare(`SELECT DISTINCT r.id,r.data_json,r.updated_at,c.code FROM simple_grc_records r
    LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id
    WHERE r.module='Risk Assessment' AND (c.code=? OR CASE WHEN json_valid(r.data_json) THEN (json_extract(r.data_json,'$.riskId')=? OR json_extract(r.data_json,'$.code')=?) ELSE 0 END) LIMIT 2`).bind(id,id,id).all<RiskRecord>();
  if (matches.results.length > 1) throw new RiskReviewError('Risk referansı birden fazla kayıtla eşleşiyor; kayıt kimliğini kullanın.');
  return matches.results[0] || null;
}

export async function riskReviewBlocker(review: RiskReviewRow, risk: RiskRecord | null) {
  const stored = riskObject(review.proposal_json);
  if (!stored) return 'proposal-invalid';
  try { const proposal = validateRiskReviewProposal(stored); if (proposal.riskId !== review.risk_id) return 'proposal-invalid'; } catch { return 'proposal-invalid'; }
  const baseline = stored.baseline as { version?: number; updatedAt?: string; dataSha256?: string } | undefined;
  if (!baseline || baseline.version !== 1 || !baseline.updatedAt || !/^[a-f0-9]{64}$/.test(baseline.dataSha256 || '')) return 'baseline-missing';
  if (!risk) return 'risk-missing';
  const data = riskObject(risk.data_json); if (!data) return 'risk-invalid';
  if (risk.id !== review.risk_id || risk.updated_at !== baseline.updatedAt || await hash(risk.data_json) !== baseline.dataSha256) return 'risk-changed';
  if (data.residualRiskReviewRequired !== true) return 'review-not-required';
  return null;
}

export async function submitRiskReview(db: D1Database, body: Record<string, unknown>, actor: string, now = new Date()) {
  const proposal = validateRiskReviewProposal(body), risk = await findRiskRecord(db, proposal.riskId);
  if (!risk) throw new RiskReviewError('Risk kaydı bulunamadı.', 404);
  const data = riskObject(risk.data_json);
  if (!data) throw new RiskReviewError('Risk verisi okunamadı. Önce risk kaydını düzeltin.');
  if (data.residualRiskReviewRequired !== true) throw new RiskReviewError('Bu risk için Continuous Assurance yeniden değerlendirmesi beklenmiyor.');
  if (typeof body.expectedRiskRevision !== 'string' || body.expectedRiskRevision !== await riskRevision(risk)) throw new RiskReviewError('Risk görünümü güncel değil. Yenileyip değerlendirmeyi güncel riskten yeniden açın.');
  const id = `CAR-${crypto.randomUUID()}`, stamp = now.toISOString();
  const stored = { ...proposal, riskId: risk.id, baseline: { version: 1, updatedAt: risk.updated_at, dataSha256: await hash(risk.data_json), context: riskDecisionContext(risk) } };
  const aliases = [...new Set([risk.id, risk.code, data.riskId, data.code].filter(Boolean).map(String))];
  const result = await db.prepare(`INSERT INTO continuous_assurance_risk_reviews(id,risk_id,status,proposal_json,submitted_by,submitted_at)
    SELECT ?,?,'pending-review',?,?,? WHERE EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment' AND data_json=? AND updated_at=?)
    AND NOT EXISTS(SELECT 1 FROM continuous_assurance_risk_reviews WHERE risk_id IN (${aliases.map(() => '?').join(',')}) AND status='pending-review')`)
    .bind(id,risk.id,JSON.stringify(stored),actor,stamp,risk.id,risk.data_json,risk.updated_at,...aliases).run();
  if (!result.meta?.changes) throw new RiskReviewError('Risk değişti veya bekleyen bir teklif var. Listeyi yenileyip mevcut teklifi inceleyin.');
  return { id, riskId: risk.id };
}

/** Claim and risk write share one transaction; a failure rolls both back. */
export async function decideRiskReview(db: D1Database, body: Record<string, unknown>, actor: string, now = new Date()) {
  const id = String(body.reviewId || '').trim(), decision = String(body.decision || ''), note = String(body.note || '').trim().slice(0,1200);
  if (!id || id.length > 120 || !['approve','reject'].includes(decision)) throw new RiskReviewError('Review ID ve approve/reject kararı zorunludur.',400);
  if (decision === 'reject' && note.length < 10) throw new RiskReviewError('Ret gerekçesi en az 10 karakter olmalıdır.',400);
  const review = await db.prepare('SELECT * FROM continuous_assurance_risk_reviews WHERE id=?').bind(id).first<RiskReviewRow>();
  if (!review) throw new RiskReviewError('Risk review bulunamadı.',404);
  if (review.status !== 'pending-review') throw new RiskReviewError('Bu review artık inceleme beklemiyor.');
  if (review.submitted_by.trim().toLowerCase() === actor.trim().toLowerCase()) throw new RiskReviewError("Maker-checker: review'u gönderen kişi onaylayamaz.");
  const stamp = now.toISOString();
  if (decision === 'reject') {
    const result = await db.prepare("UPDATE continuous_assurance_risk_reviews SET status='rejected',reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='pending-review' AND proposal_json=? AND submitted_by=?")
      .bind(actor,stamp,note,id,review.proposal_json,review.submitted_by).run();
    if (!result.meta?.changes) throw new RiskReviewError('Teklif başka bir işlemde değişti; listeyi yenileyin.');
    return { status: 'rejected' };
  }
  const risk = await db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(review.risk_id).first<RiskRecord>();
  const blocker = await riskReviewBlocker(review,risk);
  if (blocker) throw new RiskReviewError(`Teklif güncel risk sürümüne bağlı değil (${blocker}). Mevcut teklifi reddedip güncel riskten yeni teklif oluşturun.`);
  const stored = riskObject(review.proposal_json)!, proposal = validateRiskReviewProposal(stored);
  const token = crypto.randomUUID(), approved = JSON.stringify({ ...stored, approvalToken: token });
  const updated = applyApprovedResidualRisk(riskObject(risk!.data_json)!,proposal,actor,stamp);
  const result = await db.batch([
    db.prepare(`UPDATE continuous_assurance_risk_reviews SET status='approved',proposal_json=?,reviewed_by=?,reviewed_at=?,review_note=?
      WHERE id=? AND status='pending-review' AND proposal_json=? AND submitted_by=?
      AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Risk Assessment' AND data_json=? AND updated_at=?)`)
      .bind(approved,actor,stamp,note || 'Residual risk reassessment approved.',id,review.proposal_json,review.submitted_by,risk!.id,risk!.data_json,risk!.updated_at),
    db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module='Risk Assessment'
      AND EXISTS(SELECT 1 FROM continuous_assurance_risk_reviews WHERE id=? AND status='approved' AND json_extract(proposal_json,'$.approvalToken')=?)`)
      .bind(JSON.stringify(updated),stamp,risk!.id,id,token),
  ]);
  if (!result[0]?.meta?.changes) throw new RiskReviewError('Risk veya teklif başka bir işlemde değişti; listeyi yenileyin.');
  return { status: 'approved' };
}
