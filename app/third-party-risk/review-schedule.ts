export type ReviewSchedule = { profileRevision: string; previousDate: string; contractEnd: string; nextDate: string };
export type ReviewScheduleRecord = { previousDate: string; nextDate: string; contractEnd: string; cycleNumber: number; note: string; actor: string; createdAt: string };
export class ReviewScheduleError extends Error {
  constructor(public code: 'TPRM_REVIEW_DATE' | 'TPRM_REVIEW_SOURCE_CHANGED', public status = 400) { super(code); }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const validReviewDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function nextReviewMinimum(today = new Date().toISOString().slice(0, 10)) { return new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10); }
export function validNextReview(next: unknown, contractEnd: unknown, today = new Date().toISOString().slice(0, 10)): next is string {
  return validReviewDate(next) && validReviewDate(contractEnd) && next > today && next <= contractEnd;
}
export function validateReviewSchedule(value: unknown, profile: { updatedAt: unknown; nextReview: unknown; contractEnd: unknown }, today = new Date().toISOString().slice(0, 10)): ReviewSchedule {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'contractEnd,nextDate,previousDate,profileRevision' || typeof value.profileRevision !== 'string' || !value.profileRevision || !validReviewDate(value.previousDate) || !validReviewDate(value.contractEnd) || !validNextReview(value.nextDate, value.contractEnd, today)) throw new ReviewScheduleError('TPRM_REVIEW_DATE');
  if (value.profileRevision !== profile.updatedAt || value.previousDate !== profile.nextReview || value.contractEnd !== profile.contractEnd) throw new ReviewScheduleError('TPRM_REVIEW_SOURCE_CHANGED', 409);
  return value as ReviewSchedule;
}
export function parseReviewScheduleRecord(value: unknown): ReviewScheduleRecord | null {
  try {
    const event = JSON.parse(String(value)), detail = JSON.parse(event.detail);
    if (detail.schema !== 'tprm-review-schedule-v1' || !validReviewDate(detail.previousDate) || !validReviewDate(detail.nextDate) || !validReviewDate(detail.contractEnd) || detail.nextDate > detail.contractEnd || !Number.isInteger(detail.cycleNumber) || detail.cycleNumber < 1 || typeof detail.note !== 'string' || typeof event.actor !== 'string' || !event.actor || typeof event.createdAt !== 'string' || !Number.isFinite(Date.parse(event.createdAt))) return null;
    return { previousDate: detail.previousDate, nextDate: detail.nextDate, contractEnd: detail.contractEnd, cycleNumber: detail.cycleNumber, note: detail.note, actor: event.actor, createdAt: event.createdAt };
  } catch { return null; }
}
