import { AuditRequestError, requestDate, validateRequestTimeZone } from './audit-requests';
export type MilestoneFields = { title: string; description: string; owner: string; dueDate: string; timeZone: string };
export type AuditMilestone = MilestoneFields & { id: string; auditId: string; revision: string; status: 'planned' | 'in_progress' | 'completed' | 'cancelled'; note: string; createdAt: string; updatedAt: string };
export const milestoneLabels: Record<AuditMilestone['status'], [string,string]> = { planned:['Planlandı','Planned'], in_progress:['Devam ediyor','In progress'], completed:['Tamamlandı','Completed'], cancelled:['İptal edildi','Cancelled'] };
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
 validateRequestTimeZone(fields.timeZone); return fields;
}
