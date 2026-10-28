import type {Actor} from '../api/auth/security';
import {parseModuleAccess} from '../module-access';
import {joinWorkflowGuards,ensureWorkflowEvidenceSchema} from '../workflow-selection-store';
import type {WorkflowEvidence,WorkflowEvidencePin,WorkflowGuard} from '../workflow-selection';
import type {IncidentDecisionContext} from './decisions';
type Row=Record<string,string|number|null>;
export class IncidentDecisionError extends Error {
  constructor(public code:'INCIDENT_DECISION_INPUT'|'INCIDENT_SOURCE_CHANGED'|'INCIDENT_SOURCE_MISSING'|'INCIDENT_DECISION_ACCESS',public status:number){super(code);}
}
export async function readIncidentDecision(db:D1Database,id:unknown):Promise<IncidentDecisionContext> {
  if(typeof id!=='string'||!/^INC-[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
  const record=await db.prepare('SELECT * FROM enterprise_incidents WHERE id=?').bind(id).first<Row>();
  if(!record) throw new IncidentDecisionError('INCIDENT_SOURCE_MISSING',404);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record)));
  return {record,revision:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')};
}
export async function prepareIncidentDecision(db:D1Database,actor:Actor,body:Record<string,unknown>):Promise<WorkflowGuard> {
  if(body.decisionMode===undefined&&body.evidenceMode===undefined&&body.evidenceSelection===undefined) return joinWorkflowGuards();
  if(body.action!=='transition'||body.decisionMode!=='reviewed'||typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision)) throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
  const context=await readIncidentDecision(db,body.incidentId);
  if(context.revision!==body.expectedRevision) throw new IncidentDecisionError('INCIDENT_SOURCE_CHANGED',409);
  const live=await db.prepare('SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id||'').first<Row>();
  if(!live||live.status!=='Active'||!['Admin','Editor'].includes(String(live.role))||live.role!==actor.role||String(live.email).toLowerCase()!==actor.email.toLowerCase()||(live.role!=='Admin'&&parseModuleAccess(live.policy_json===null?null:String(live.policy_json)).mode!=='full')) throw new IncidentDecisionError('INCIDENT_DECISION_ACCESS',403);
  const keys=Object.keys(context.record);
  if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k))) throw new IncidentDecisionError('INCIDENT_SOURCE_CHANGED',409);
  return joinWorkflowGuards({sql:`EXISTS (SELECT 1 FROM enterprise_incidents i JOIN json_each(?) s ON ${keys.map(k=>`i.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')})`,values:[JSON.stringify([context.record])]},
    {sql:"EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)",values:[live.id,live.email,live.role,live.policy_json]});
}
export async function readIncidentHistory(db:D1Database,id:unknown,cursor:string|null) {
  await readIncidentDecision(db,id);
  let before:string[]|null=null;
  if(cursor!==null) {
    try {const value=JSON.parse(cursor);if(!Array.isArray(value)||value.length!==2||value.some(x=>typeof x!=='string')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[0])||!/^[a-zA-Z0-9_-]{1,120}$/.test(value[1])) throw new Error();before=value;} catch {throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);}
  }
  const rows=await db.prepare(`SELECT * FROM enterprise_incident_events WHERE incident_id=?${before?' AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 51`).bind(id,...(before?[before[0],before[0],before[1]]:[])).all<Row>();
  const events=rows.results.slice(0,50),last=events.at(-1);
  await ensureWorkflowEvidenceSchema(db);
  const pins=await db.prepare("SELECT * FROM workflow_evidence_pins WHERE workflow='incidents' AND entity_id=? AND event_id IN (SELECT value FROM json_each(?)) ORDER BY created_at,id").bind(id,JSON.stringify(events.map(x=>x.id))).all<Row>();
  const evidencePins:WorkflowEvidencePin[]=pins.results.map(row=>{
    const evidence=JSON.parse(String(row.snapshot_json)) as WorkflowEvidence;
    if(!evidence||typeof evidence.id!=='string'||typeof evidence.fileKey!=='string'||typeof evidence.fileName!=='string'||!Number.isInteger(evidence.versionNo)) throw new Error('Invalid retained evidence');
    return {id:String(row.id),eventId:String(row.event_id),entityId:String(row.entity_id),purpose:String(row.purpose),evidence,actor:String(row.actor),createdAt:String(row.created_at)};
  });
  return {events,evidencePins,nextCursor:rows.results.length>50&&last?JSON.stringify([last.created_at,last.id]):null};
}
