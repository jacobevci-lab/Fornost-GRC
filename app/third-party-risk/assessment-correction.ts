import { TPRM_CONTROLS, validateAssessment, type TprmControl } from './domain';

export const CORRECTION_PHRASES = { return: 'DEĞERLENDİRMEYİ GERİ GÖNDER', revise: 'DEĞERLENDİRMEYİ DÜZELT' } as const;
export type CorrectionMode = keyof typeof CORRECTION_PHRASES;
export type AssessmentContent = ReturnType<typeof validateAssessment>;
export type AssessmentSnapshot = Omit<AssessmentContent, 'vendorId'> & {
  id: string; cycleNumber: number; status: string; revision: string; createdBy: string; updatedBy: string;
  submittedBy: string | null; submittedAt: string | null; evidenceReference: string | null; evidenceSha256: string | null;
};
export type CorrectionContext = {
  assessment: AssessmentSnapshot; token: string; canRevise: boolean; canReturn: boolean;
  profile: { vendorId: string; name: string; service: string; riskOwner: string; reviewer: string; status: string; revision: string; nextReview: string; contractEnd: string };
};
export type CorrectionRecord = { mode: CorrectionMode; note: string; before: AssessmentSnapshot; after: AssessmentSnapshot };
export type CorrectionHistory = { assessmentId: string; page: number; hasMore: boolean; rows: { id: string; actor: string; createdAt: string; detail: CorrectionRecord | null }[] };
export class AssessmentCorrectionError extends Error {
  constructor(public code: 'TPRM_CORRECTION_INPUT' | 'TPRM_CORRECTION_ACCESS' | 'TPRM_CORRECTION_SOURCE_CHANGED' | 'TPRM_CORRECTION_UNCHANGED', public status = 400) { super(code); }
}
const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function validateCorrection(input: Record<string, unknown>, mode: CorrectionMode, vendorId: string) {
  const fields = ['impact', 'likelihood', 'controlMaturity', 'treatmentPlan', ...TPRM_CONTROLS];
  const keys = ['action', 'assessmentId', 'contextToken', 'note', 'confirmation', ...(mode === 'revise' ? fields : [])];
  if (Object.keys(input).some(key => !keys.includes(key)) || !text(input.assessmentId, 1, 100) || typeof input.contextToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.contextToken) || !text(input.note, 20, 1200) || input.confirmation !== CORRECTION_PHRASES[mode]) throw new AssessmentCorrectionError('TPRM_CORRECTION_INPUT');
  let content: AssessmentContent | undefined;
  if (mode === 'revise') {
    if (['impact','likelihood','controlMaturity'].some(key => typeof input[key] !== 'number' || !Number.isInteger(input[key]) || Number(input[key]) < 1 || Number(input[key]) > 5) || TPRM_CONTROLS.some(key => typeof input[key] !== 'boolean') || !text(input.treatmentPlan, 10, 2000)) throw new AssessmentCorrectionError('TPRM_CORRECTION_INPUT');
    content = validateAssessment({ ...input, vendorId });
  }
  return { note: String(input.note).trim(), content };
}
export function assessmentDraft(value: AssessmentSnapshot): Record<string, unknown> {
  return { impact: value.impact, likelihood: value.likelihood, controlMaturity: value.controlMaturity, treatmentPlan: value.treatmentPlan, ...value.questionnaire };
}
export function sameAssessmentDraft(draft: Record<string, unknown>, value: AssessmentSnapshot) {
  return (['impact','likelihood','controlMaturity'] as const).every(key => Number(draft[key]) === value[key]) && String(draft.treatmentPlan).trim() === value.treatmentPlan && TPRM_CONTROLS.every(key => draft[key] === value.questionnaire[key]);
}
function validSnapshot(value: unknown): value is AssessmentSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as AssessmentSnapshot;
  return ['id','status','revision','createdBy','updatedBy','riskTier','treatmentPlan'].every(key => typeof (v as unknown as Record<string,unknown>)[key] === 'string') && ['cycleNumber','impact','likelihood','controlMaturity','coverage','inherentScore','residualScore'].every(key => Number.isFinite((v as unknown as Record<string,unknown>)[key])) && Boolean(v.questionnaire) && TPRM_CONTROLS.every(key => typeof v.questionnaire[key] === 'boolean') && Array.isArray(v.criticalGaps) && v.criticalGaps.every(key => TPRM_CONTROLS.includes(key as TprmControl)) && ['submittedBy','submittedAt','evidenceReference','evidenceSha256'].every(key => (v as unknown as Record<string,unknown>)[key] === null || typeof (v as unknown as Record<string,unknown>)[key] === 'string');
}
export function parseCorrectionRecord(raw: unknown): CorrectionRecord | null {
  try {
    const v = JSON.parse(String(raw));
    if (v?.schema !== 'tprm-assessment-correction-v1' || !['return','revise'].includes(v.mode) || !text(v.note,20,1200) || !validSnapshot(v.before) || !validSnapshot(v.after) || v.before.id !== v.after.id || v.before.cycleNumber !== v.after.cycleNumber) return null;
    return { mode:v.mode, note:v.note, before:v.before, after:v.after };
  } catch { return null; }
}
