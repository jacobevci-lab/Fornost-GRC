import { parseFindingDeadline } from './finding-deadline';
import { ensureWorkflowEvidenceSchema } from '../workflow-selection-store';
import { FindingHistoryError, findingEventDetail, parseFindingEvidence, type FindingHistory } from './finding-history';

/** Scope each page and cursor to the canonical source; a new decision cannot shift older pages. */
export async function readFindingHistory(db: D1Database, findingId: string, before: string | null): Promise<FindingHistory> {
  const finding = await db.prepare('SELECT f.* FROM third_party_findings f JOIN third_party_profiles p ON p.vendor_id=f.vendor_id JOIN third_party_assessments a ON a.id=f.assessment_id AND a.vendor_id=f.vendor_id WHERE f.id=?').bind(findingId).first<Record<string,string>>();
  if (!finding) throw new FindingHistoryError(404);
  const values = [finding.vendor_id, finding.assessment_id, findingId];
  const where = 'vendor_id=? AND assessment_id=? AND finding_id=?';
  const cursor = before ? await db.prepare(`SELECT id,created_at FROM third_party_events WHERE ${where} AND id=?`).bind(...values,before).first<{id:string;created_at:string}>() : null;
  if (before && !cursor) throw new FindingHistoryError(400);
  const result = await db.prepare(`SELECT id,action,detail,actor,created_at FROM third_party_events WHERE ${where}${cursor ? ' AND (created_at<? OR (created_at=? AND id<?))' : ''} ORDER BY created_at DESC,id DESC LIMIT 21`).bind(...values,...(cursor ? [cursor.created_at,cursor.created_at,cursor.id] : [])).all<Record<string,string>>();
  const events = result.results.slice(0,20);
  await ensureWorkflowEvidenceSchema(db);
  // event_id is unique in the retained pin store; the page bounds this read to 20 pins.
  const pins = events.length ? (await db.prepare("SELECT * FROM workflow_evidence_pins WHERE workflow='tprm' AND entity_id=? AND event_id IN (SELECT value FROM json_each(?))").bind(findingId,JSON.stringify(events.map(row=>row.id))).all<Record<string,string>>()).results : [];
  return {
    finding:{ id:finding.id, vendorId:finding.vendor_id, assessmentId:finding.assessment_id, title:finding.title, owner:finding.owner, dueDate:finding.due_date, status:finding.status, actionNote:finding.action_note || '' },
    before, nextCursor:result.results.length > 20 ? events[events.length-1].id : null,
    rows:events.map(row=>{
      const matches = pins.filter(pin=>pin.event_id===row.id), pin = matches.length===1 ? matches[0] : null;
      const purpose = row.action==='finding-submit-finding' ? 'submit-finding' : row.action==='finding-verify-finding' ? 'verify-finding' : null;
      const evidence = pin && pin.purpose===purpose && pin.actor===row.actor ? parseFindingEvidence(pin.snapshot_json) : null;
      return { id:row.id, action:row.action, actor:row.actor, createdAt:row.created_at, detail:row.detail, ...findingEventDetail(row.action,row.detail),
        ...(row.action==='finding-deadline-changed'?{deadline:parseFindingDeadline(row.detail)}:{}),
        pin:evidence && pin ? { id:pin.id, eventId:pin.event_id, entityId:pin.entity_id, purpose:pin.purpose, evidence, actor:pin.actor, createdAt:pin.created_at } : null,
        pinIssue:matches.length>0 && !evidence };
    }),
  };
}
