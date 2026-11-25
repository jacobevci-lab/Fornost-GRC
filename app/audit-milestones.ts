import { AuditRequestError, requestDate, validateRequestTimeZone } from './audit-requests';
import type { EvidenceChangeOrigin } from './evidence/change-followups';
export const recurrenceLabels = {none:['Tek seferlik','One-off'],weekly:['Haftalık','Weekly'],monthly:['Aylık','Monthly'],quarterly:['Üç aylık','Quarterly'],yearly:['Yıllık','Yearly']} as const;
export type MilestoneRecurrence = keyof typeof recurrenceLabels;
export type MilestoneFields = { title: string; description: string; owner: string; dueDate: string; timeZone: string; reviewer?: string; reviewDueDate?: string; dependsOn?: string[]; recurrence?: MilestoneRecurrence; remindersEnabled?: boolean };
export type AuditMilestone = MilestoneFields & { id: string; auditId: string; revision: string; status: 'planned' | 'in_progress' | 'submitted' | 'changes_requested' | 'completed' | 'cancelled'; note: string; submittedBy?: string; submittedAt?: string; reviewedBy?: string; reviewedAt?: string; recurrenceOf?: string; recurrenceDay?: number; evidenceChangeOrigin?: EvidenceChangeOrigin; createdAt: string; updatedAt: string };
export const milestoneLabels: Record<AuditMilestone['status'], [string,string]> = { planned:['Planlandı','Planned'], in_progress:['Devam ediyor','In progress'], submitted:['İncelemede','In review'], changes_requested:['Düzeltme istendi','Changes requested'], completed:['Tamamlandı','Completed'], cancelled:['İptal edildi','Cancelled'] };
export const emptyMilestone: MilestoneFields = { title:'', description:'', owner:'', dueDate:'', timeZone:'UTC' };
export function validateMilestone(input: unknown): MilestoneFields {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuditRequestError('fields');
 const raw=input as Record<string,unknown>, fields={...emptyMilestone};
 for (const [key,max] of [['title',200],['description',2000],['owner',254],['dueDate',10],['timeZone',80]] as const) {
  if (typeof raw[key]!=='string' || raw[key].length>max) throw new AuditRequestError('fields'); fields[key]=raw[key].trim();
 }
 fields.owner=fields.owner.toLowerCase();
 if (fields.title.length<3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.owner)) throw new AuditRequestError('fields');
 if (!requestDate(fields.dueDate)) throw new AuditRequestError('dates');
 if(raw.reviewer!==undefined||raw.reviewDueDate!==undefined){
  if(typeof raw.reviewer!=='string'||raw.reviewer.length>254||typeof raw.reviewDueDate!=='string'||raw.reviewDueDate.length>10)throw new AuditRequestError('review-fields');
  fields.reviewer=raw.reviewer.trim().toLowerCase();fields.reviewDueDate=raw.reviewDueDate.trim();
  if(fields.reviewer?(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.reviewer)||fields.reviewer===fields.owner||!requestDate(fields.reviewDueDate)||fields.reviewDueDate<fields.dueDate):!!fields.reviewDueDate)throw new AuditRequestError('review-fields');
 }
 if (raw.dependsOn !== undefined) {
  if (!Array.isArray(raw.dependsOn) || raw.dependsOn.length > 20 || new Set(raw.dependsOn).size !== raw.dependsOn.length || raw.dependsOn.some(id => typeof id !== 'string' || !/^AMT-[a-f0-9-]{36}$/.test(id))) throw new AuditRequestError('dependencies');
  fields.dependsOn = [...raw.dependsOn] as string[];
 }
 if(raw.remindersEnabled!==undefined){if(typeof raw.remindersEnabled!=='boolean')throw new AuditRequestError('fields');fields.remindersEnabled=raw.remindersEnabled;}
 if (raw.recurrence !== undefined) {
  if (typeof raw.recurrence !== 'string' || !Object.hasOwn(recurrenceLabels,raw.recurrence)) throw new AuditRequestError('recurrence');
  fields.recurrence=raw.recurrence as MilestoneRecurrence;
 }
 validateRequestTimeZone(fields.timeZone); return fields;
}

/** The entire bounded audit graph is checked before its revision-guarded atomic write. */
export function validateMilestoneGraph(rows: AuditMilestone[]): void {
 const byId = new Map(rows.map(row => [row.id, row])), visiting = new Set<string>(), visited = new Set<string>();
 function visit(id: string) {
  if (visiting.has(id)) throw new AuditRequestError('dependency-cycle',409);
  if (visited.has(id)) return;
  const row = byId.get(id);
  if (!row) throw new AuditRequestError('dependency-missing',409);
  visiting.add(id);
  for (const prerequisite of row.dependsOn || []) visit(prerequisite);
  visiting.delete(id); visited.add(id);
 }
 for (const row of rows) visit(row.id);
 for (const row of rows) if (['in_progress','submitted','changes_requested','completed'].includes(row.status) && (row.dependsOn || []).some(id => byId.get(id)?.status !== 'completed')) throw new AuditRequestError('dependency-blocked',409);
}

export function milestoneNextDue(row: Pick<AuditMilestone,'status'|'dueDate'|'reviewDueDate'>): string {
 return row.status==='submitted' ? row.reviewDueDate||'' : row.dueDate;
}

/** Calendar dates use UTC arithmetic; the deadline still uses the task's IANA zone. */
export function nextMilestoneDate(dueDate:string, recurrence:MilestoneRecurrence, anchorDay=Number(dueDate.slice(8))):string {
 if(!requestDate(dueDate)||!Number.isInteger(anchorDay)||anchorDay<1||anchorDay>31||!Object.hasOwn(recurrenceLabels,recurrence)||recurrence==='none')throw new AuditRequestError('recurrence');
 const date=new Date(dueDate+'T12:00:00Z');
 if(recurrence==='weekly')date.setUTCDate(date.getUTCDate()+7);
 else {
  const months=recurrence==='monthly'?1:recurrence==='quarterly'?3:12;
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
  const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  date.setUTCDate(Math.min(anchorDay,last.getUTCDate()));
 }
 const result=date.toISOString().slice(0,10);
 if(!requestDate(result)||result<=dueDate)throw new AuditRequestError('dates');
 return result;
}
