export type ReviewerWorkCounts = { activeAssessments: number; submittedAssessments: number; openFindings: number; verificationFindings: number };
export type ReviewerContext = { vendorId: string; name: string; reviewer: string; revision: string; status: string; token: string; exclusions: string[]; counts: ReviewerWorkCounts };
export type ReviewerHandoffRecord = { previousReviewer: string; reviewer: string; note: string; counts: ReviewerWorkCounts };
export type ReviewerHistory = { vendorId: string; page: number; rows: { id: string; actor: string; createdAt: string; detail: ReviewerHandoffRecord | null }[]; hasMore: boolean };
export const HANDOFF_CONFIRMATION = 'İNCELEMECİYİ DEĞİŞTİR';
export const canReassignReviewer = (status: string, role: string) => role === 'Admin' && ['onboarding','in-review','reassessment','approved','conditional'].includes(status);
export class ReviewerHandoffError extends Error {
  constructor(public code: 'TPRM_REVIEWER_INPUT' | 'TPRM_REVIEWER_SOURCE_CHANGED' | 'TPRM_REVIEWER_ACCESS' | 'TPRM_REVIEWER_LIMIT', public status = 400) { super(code); }
}
export function validateReviewerHandoff(input: Record<string, unknown>) {
  const allowed = ['action','vendorId','expectedRevision','previousReviewer','contextToken','reviewer','assignmentMode','note','confirmation'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || input.assignmentMode !== 'directory' || input.confirmation !== HANDOFF_CONFIRMATION || typeof input.vendorId !== 'string' || !input.vendorId || input.vendorId.length > 100 || typeof input.expectedRevision !== 'string' || !input.expectedRevision || typeof input.previousReviewer !== 'string' || !input.previousReviewer || typeof input.contextToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.contextToken) || typeof input.reviewer !== 'string' || !input.reviewer.trim() || input.reviewer.length > 254 || typeof input.note !== 'string' || input.note.trim().length < 20 || input.note.trim().length > 1200 || input.note.includes('\u0000')) throw new ReviewerHandoffError('TPRM_REVIEWER_INPUT');
  return { vendorId: input.vendorId, expectedRevision: input.expectedRevision, previousReviewer: input.previousReviewer, token: input.contextToken, note: input.note.trim() };
}
export function parseReviewerHandoffRecord(value: unknown): ReviewerHandoffRecord | null {
  try {
    const row = JSON.parse(String(value));
    if (!row || row.schema !== 'tprm-reviewer-handoff-v1' || !['previousReviewer','reviewer','note'].every(key => typeof row[key] === 'string' && row[key].length > 0) || !row.counts || !['activeAssessments','submittedAssessments','openFindings','verificationFindings'].every(key => Number.isInteger(row.counts[key]) && row.counts[key] >= 0 && row.counts[key] <= 2000) || row.counts.submittedAssessments > row.counts.activeAssessments || row.counts.verificationFindings > row.counts.openFindings) return null;
    return { previousReviewer: row.previousReviewer, reviewer: row.reviewer, note: row.note, counts: row.counts };
  } catch { return null; }
}
