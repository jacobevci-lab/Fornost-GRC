import type {Actor} from '../api/auth/security';
import {parseModuleAccess} from '../module-access';
import type {WorkflowGuard,WorkflowEvidence,WorkflowEvidencePin} from '../workflow-selection';
import {joinWorkflowGuards,ensureWorkflowEvidenceSchema} from '../workflow-selection-store';
import type {FindingDecisionContext} from './decisions';
type Row=Record<string,string|number|null>;
export class FindingDecisionError extends Error {
 constructor(public code:'FINDING_DECISION_INPUT'|'FINDING_SOURCE_CHANGED'|'FINDING_SOURCE_MISSING'|'FINDING_DECISION_ACCESS',public status:number){super(code)}
}
/** Only the current authorized history page is projected; older pages retain their own pins. */
export async function readFindingDecisionPins(db:D1Database,findingId:string,eventIds:string[]):Promise<WorkflowEvidencePin[]>{
 await ensureWorkflowEvidenceSchema(db);
 const rows=await db.prepare("SELECT * FROM workflow_evidence_pins WHERE workflow='findings' AND entity_id=? AND event_id IN (SELECT value FROM json_each(?)) ORDER BY created_at,id").bind(findingId,JSON.stringify(eventIds)).all<{id:string;event_id:string;entity_id:string;purpose:string;snapshot_json:string;actor:string;created_at:string}>();
 return rows.results.map(row=>{
  const evidence=JSON.parse(row.snapshot_json) as WorkflowEvidence;
  if(!evidence||typeof evidence.id!=='string'||typeof evidence.fileKey!=='string'||typeof evidence.fileName!=='string'||!Number.isInteger(evidence.versionNo))throw new Error('Invalid retained evidence');
  return {id:row.id,eventId:row.event_id,entityId:row.entity_id,purpose:row.purpose,evidence,actor:row.actor,createdAt:row.created_at};
 });
}
export async function readFindingDecision(db:D1Database,id:unknown):Promise<FindingDecisionContext>{
 if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id))throw new FindingDecisionError('FINDING_DECISION_INPUT',400);
 const record=await db.prepare('SELECT * FROM enterprise_findings WHERE id=?').bind(id).first<Row>();
 if(!record)throw new FindingDecisionError('FINDING_SOURCE_MISSING',404);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record)));
 return {record,revision:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')};
}
/** Complete reviewed source and live acting identity are bound to the committing claim. */
export async function prepareFindingDecision(db:D1Database,actor:Actor,body:Record<string,unknown>):Promise<WorkflowGuard>{
 if(body.decisionMode===undefined&&body.evidenceMode===undefined&&body.evidenceSelection===undefined)return joinWorkflowGuards();
 if(body.action!=='transition'||body.decisionMode!=='reviewed'||typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision))throw new FindingDecisionError('FINDING_DECISION_INPUT',400);
 const context=await readFindingDecision(db,body.findingId);
 if(context.revision!==body.expectedRevision)throw new FindingDecisionError('FINDING_SOURCE_CHANGED',409);
 const live=await db.prepare('SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id||'').first<Row>();
 if(!live||live.status!=='Active'||!['Admin','Editor'].includes(String(live.role))||live.role!==actor.role||String(live.email).toLowerCase()!==actor.email.toLowerCase()||(live.role!=='Admin'&&parseModuleAccess(live.policy_json===null?null:String(live.policy_json)).mode!=='full'))throw new FindingDecisionError('FINDING_DECISION_ACCESS',403);
 const keys=Object.keys(context.record);if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)))throw new FindingDecisionError('FINDING_SOURCE_CHANGED',409);
 return joinWorkflowGuards({sql:`EXISTS (SELECT 1 FROM enterprise_findings f JOIN json_each(?) s ON ${keys.map(k=>`f.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')})`,values:[JSON.stringify([context.record])]},
  {sql:"EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)",values:[live.id,live.email,live.role,live.policy_json]});
}
