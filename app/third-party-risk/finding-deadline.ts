import { validReviewDate } from './review-schedule';

export const FINDING_DEADLINE_PHRASE = 'BULGU TERMİNİNİ DEĞİŞTİR';
export type DeadlineFinding = { id:string; vendorId:string; assessmentId:string; title:string; owner:string; status:string; severity:string; dueDate:string; actionNote:string; createdBy:string; submittedBy:string|null };
export type DeadlineProfile = { vendorId:string; name:string; reviewer:string; createdBy:string; businessOwner:string; riskOwner:string; status:string; contractEnd:string };
export type FindingDeadlineContext = { finding:DeadlineFinding; profile:DeadlineProfile; cycleNumber:number; token:string; canSchedule:boolean; today:string };
export type FindingDeadlineRecord = { previousDate:string; nextDate:string; note:string; owner:string; status:string; severity:string; cycleNumber:number; wasOverdue:boolean };
export class FindingDeadlineError extends Error {
  constructor(public code:'TPRM_DEADLINE_INPUT'|'TPRM_DEADLINE_ACCESS'|'TPRM_DEADLINE_SOURCE_CHANGED', public status=400) { super(code); }
}
export function canScheduleFinding(actor:{email:string;role:string}, finding:Pick<DeadlineFinding,'owner'|'createdBy'|'submittedBy'|'status'>, profile:Pick<DeadlineProfile,'reviewer'|'createdBy'|'businessOwner'|'riskOwner'|'status'>) {
  const same=(value:string|null|undefined)=>Boolean(value)&&value?.toLowerCase()===actor.email.toLowerCase();
  return actor.role==='Admin' && same(profile.reviewer) && ![finding.owner,finding.createdBy,finding.submittedBy,profile.createdBy,profile.businessOwner,profile.riskOwner].some(same) && ['open','in-progress'].includes(finding.status) && ['onboarding','in-review','reassessment','approved','conditional'].includes(profile.status);
}
const validNote=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>=20&&value.length<=1200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function validateFindingDeadline(input:Record<string,unknown>, previousDate:string, today:string) {
  if (Object.keys(input).some(key=>!['action','findingId','contextToken','nextDate','note','confirmation'].includes(key)) || input.action!=='reschedule-finding' || typeof input.findingId!=='string' || !input.findingId.trim() || input.findingId.length>100 || input.findingId.includes('\u0000') || typeof input.contextToken!=='string' || !/^[a-f0-9]{64}$/.test(input.contextToken) || !validReviewDate(input.nextDate) || input.nextDate<today || input.nextDate===previousDate || !validNote(input.note) || input.confirmation!==FINDING_DEADLINE_PHRASE) throw new FindingDeadlineError('TPRM_DEADLINE_INPUT');
  return {nextDate:input.nextDate,note:input.note.trim()};
}
/** Read only retained facts. In particular, never recompute historical lateness from today's date. */
export function parseFindingDeadline(raw:unknown):FindingDeadlineRecord|null {
  try {
    const v=JSON.parse(String(raw));
    if (v?.schema!=='tprm-finding-deadline-v1'||!validReviewDate(v.previousDate)||!validReviewDate(v.nextDate)||v.previousDate===v.nextDate||!validNote(v.note)||typeof v.owner!=='string'||!v.owner||!['open','in-progress'].includes(v.status)||!['low','medium','high','critical'].includes(v.severity)||!Number.isSafeInteger(v.cycleNumber)||v.cycleNumber<1||typeof v.wasOverdue!=='boolean') return null;
    return {previousDate:v.previousDate,nextDate:v.nextDate,note:v.note,owner:v.owner,status:v.status,severity:v.severity,cycleNumber:v.cycleNumber,wasOverdue:v.wasOverdue};
  } catch { return null; }
}
