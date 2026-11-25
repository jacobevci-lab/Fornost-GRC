import { AuditRequestError } from './audit-requests';
import { validateMilestone, type MilestoneFields } from './audit-milestones';

export type MilestoneBatchItem = { id: string; fields: MilestoneFields };
export function validateMilestoneBatch(value: unknown): MilestoneBatchItem[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new AuditRequestError('fields');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'fields'].includes(key)) || typeof item.id !== 'string' || !/^AMT-[a-f0-9-]{36}$/.test(item.id) || ids.has(item.id)) throw new AuditRequestError('fields');
    ids.add(item.id);
    if (!item.fields || Object.keys(item.fields).some(key => !['title','description','owner','dueDate','timeZone','dependsOn'].includes(key))) throw new AuditRequestError('fields');
    return { id: item.id, fields: { ...validateMilestone(item.fields), recurrence: 'none', remindersEnabled: false } };
  });
}
