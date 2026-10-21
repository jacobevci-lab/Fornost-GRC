import { AuditRequestError, requestDate, validateRequestTimeZone } from './audit-requests';
export type MilestoneFields = { title: string; description: string; owner: string; dueDate: string; timeZone: string; dependsOn?: string[] };
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
 if (raw.dependsOn !== undefined) {
  if (!Array.isArray(raw.dependsOn) || raw.dependsOn.length > 20 || new Set(raw.dependsOn).size !== raw.dependsOn.length || raw.dependsOn.some(id => typeof id !== 'string' || !/^AMT-[a-f0-9-]{36}$/.test(id))) throw new AuditRequestError('dependencies');
  fields.dependsOn = [...raw.dependsOn] as string[];
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
 for (const row of rows) if (['in_progress','completed'].includes(row.status) && (row.dependsOn || []).some(id => byId.get(id)?.status !== 'completed')) throw new AuditRequestError('dependency-blocked',409);
}
