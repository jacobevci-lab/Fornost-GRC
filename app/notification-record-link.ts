import { recordLinkTarget, type RecordLinkTarget } from './record-links';
import type { AssuranceDeliveryOutbox } from './assurance-notification-delivery';
export function notificationRecordTarget(item: AssuranceDeliveryOutbox): RecordLinkTarget | undefined {
  if (item.route !== 'audit-request') return;
  try {
    const source = JSON.parse(item.source_json || '{}');
    if (source.kind !== 'audit-request' || source.requestId !== item.escalation_id) return;
    return recordLinkTarget({module:'Denetim Yönetimi',kind:'audit-request',ref:source.requestId,auditId:source.auditId}) || undefined;
  } catch { return; }
}
