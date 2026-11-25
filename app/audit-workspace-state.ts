import { auditNameKey } from './audit-readiness-portfolio';
import { isClosedAuditRequirement, isOverdueAuditRequirement } from './audit-overdue-requirements';
import { hasReportValue } from './report-export';
export type AuditQueue = 'all'|'overdue'|'evidence'|'review'|'unassigned';
export function auditRequirementMatches(data:Record<string,unknown>,queue:AuditQueue,now=Date.now()) {
 if(queue==='all')return true;
 if(isClosedAuditRequirement(data.status))return false;
 if(queue==='overdue')return isOverdueAuditRequirement(data,now);
 if(queue==='unassigned')return !hasReportValue(data.owner)||['atanmadı','unassigned'].includes(auditNameKey(data.owner));
 if(queue==='evidence')return ['kanıt bekleniyor','awaiting evidence','evidence requested'].includes(auditNameKey(data.evidenceStatus));
 return ['incelemede','in review','submitted'].includes(auditNameKey(data.status))||['incelemede','in review','submitted'].includes(auditNameKey(data.evidenceStatus));
}
export function auditBoardLane(data:Record<string,unknown>):'todo'|'doing'|'review'|'closed' {
 if(isClosedAuditRequirement(data.status))return 'closed';
 if(auditRequirementMatches(data,'review'))return 'review';
 if(['devam ediyor','in progress','in-progress'].includes(auditNameKey(data.status)))return 'doing';
 return 'todo';
}
export function auditPreferredArea(focus:{milestone?:string;workpaper?:string;closure?:string;requirement?:string;request?:string;area?:string}) {
 if(focus.area&&['work','requests','findings','report'].includes(focus.area))return focus.area;
 return focus.closure?'report':focus.request?'requests':'work';
}
