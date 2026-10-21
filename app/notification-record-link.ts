import { recordLinkTarget, type RecordLinkTarget } from './record-links';
import type { AssuranceDeliveryOutbox } from './assurance-notification-delivery';
export function notificationRecordTarget(item: AssuranceDeliveryOutbox): RecordLinkTarget | undefined {
  if (!['audit-request','audit-milestone','audit-workpaper'].includes(item.route)) return;
  try {
    const source = JSON.parse(item.source_json || '{}');
    if(item.route==='audit-milestone'){if(source.kind!=='audit-milestone'||source.milestoneId!==item.escalation_id)return;return recordLinkTarget({module:'Denetim Yönetimi',kind:'audit-milestone',ref:source.milestoneId,auditId:source.auditId})||undefined;}
    if(item.route==='audit-workpaper'){if(source.kind!=='audit-workpaper'||source.workpaperId!==item.escalation_id)return;return recordLinkTarget({module:'Denetim Yönetimi',kind:'audit-workpaper',ref:source.workpaperId,auditId:source.auditId})||undefined;}
    if (source.kind !== 'audit-request' || source.requestId !== item.escalation_id) return;
    return recordLinkTarget({module:'Denetim Yönetimi',kind:'audit-request',ref:source.requestId,auditId:source.auditId}) || undefined;
  } catch { return; }
}
