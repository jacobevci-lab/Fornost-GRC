import { isClosedAuditRequirement, isOverdueAuditRequirement } from './audit-overdue-requirements';
import type { AuditWorkpaper } from './audit-workpapers';
import type { AuditRequest } from './audit-requests';
export type AuditDeskRequirement={id:string;code?:string;data:Record<string,unknown>};
export type AuditWorkLane='evidence'|'preparing'|'review'|'complete';
export const auditLaneLabels:Record<AuditWorkLane,[string,string]>={evidence:['Kanıt bekleyen','Awaiting evidence'],preparing:['Hazırlanıyor','In preparation'],review:['İnceleme bekleyen','Awaiting review'],complete:['Madde kapalı','Requirement closed']};
export const auditRequirementTitle=(r:AuditDeskRequirement)=>String(r.data.requirementTitle||r.data.title||r.data.requirementRef||r.code||r.id);
export function requirementWork(row:AuditDeskRequirement,requests:AuditRequest[],papers:AuditWorkpaper[]) {
  const linkedRequests=requests.filter(r=>r.requirementId===row.id&&r.status!=='cancelled');
  const linkedPapers=papers.filter(r=>r.requirementId===row.id&&r.status!=='cancelled');
  const review=linkedRequests.some(r=>r.status==='submitted')||linkedPapers.some(r=>r.status==='submitted');
  const openWork=linkedRequests.some(r=>r.status!=='accepted')||linkedPapers.some(r=>r.status!=='approved');
  // A record's manual completion is not an independent test approval. Pending work takes precedence.
  const lane:AuditWorkLane=review?'review':isClosedAuditRequirement(row.data.status)&&!openWork?'complete':linkedPapers.length||linkedRequests.some(r=>r.status==='accepted')||String(row.data.status)==='Devam Ediyor'?'preparing':'evidence';
  return {lane,requests:linkedRequests,papers:linkedPapers,approvedTests:linkedPapers.filter(r=>r.status==='approved').length};
}
export function filterAuditRequirements(rows:AuditDeskRequirement[],query:string,owner:string,overdue:boolean,now:number) {
  const q=query.trim().toLocaleLowerCase('tr-TR');
  return rows.filter(r=>(!owner||String(r.data.owner||r.data.auditOwner||'')===owner)&&(!overdue||isOverdueAuditRequirement(r.data,now))&&(!q||[r.id,r.code,...Object.values(r.data)].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
}
