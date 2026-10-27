import type {Actor} from '../api/auth/security';
import {parseModuleAccess} from '../module-access';
import {joinWorkflowGuards} from '../workflow-selection-store';
import type {WorkflowGuard} from '../workflow-selection';
import type {PolicyDecisionContext,PolicyDecisionKind} from './decisions';

type Row=Record<string,string|number|null>;
export class PolicyDecisionError extends Error {
  constructor(public code:'POLICY_DECISION_INPUT'|'POLICY_SOURCE_CHANGED'|'POLICY_SOURCE_MISSING'|'POLICY_DECISION_ACCESS',public status:number){super(code)}
}
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(value);
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const tables={version:'policy_versions',exception:'policy_exceptions',retire:'policy_documents'};
function rowGuard(table:string,row:Row):WorkflowGuard {
  const keys=Object.keys(row);if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)))throw new PolicyDecisionError('POLICY_SOURCE_CHANGED',409);
  return {sql:`EXISTS (SELECT 1 FROM ${table} t JOIN json_each(?) s ON ${keys.map(k=>`t.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')})`,values:[JSON.stringify([row])]};
}
export async function readPolicyDecision(db:D1Database,kind:unknown,id:unknown):Promise<PolicyDecisionContext> {
  if(!['version','exception','retire'].includes(String(kind))||!validId(id))throw new PolicyDecisionError('POLICY_DECISION_INPUT',400);
  const k=kind as PolicyDecisionKind,record=await db.prepare(`SELECT * FROM ${tables[k]} WHERE id=?`).bind(id).first<Row>();
  if(!record)throw new PolicyDecisionError('POLICY_SOURCE_MISSING',404);
  const policy=k==='retire'?record:await db.prepare('SELECT * FROM policy_documents WHERE id=?').bind(record.policy_id).first<Row>();
  if(!policy)throw new PolicyDecisionError('POLICY_SOURCE_MISSING',404);
  const version=k==='version'?record:await db.prepare('SELECT * FROM policy_versions WHERE id=? AND policy_id=?').bind(k==='retire'?policy.current_version_id:record.version_id,policy.id).first<Row>();
  if(!version)throw new PolicyDecisionError('POLICY_SOURCE_MISSING',404);
  return {kind:k,record,policy,version,revision:await digest({kind:k,record,policy,version})};
}
/** New reviewed decisions bind the complete displayed source and current local actor. Legacy clients remain unchanged. */
export async function preparePolicyDecision(db:D1Database,actor:Actor,body:Record<string,unknown>):Promise<WorkflowGuard> {
  if(body.decisionMode===undefined&&body.evidenceMode===undefined&&body.evidenceSelection===undefined)return joinWorkflowGuards();
  if(body.decisionMode!=='reviewed'||typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision))throw new PolicyDecisionError('POLICY_DECISION_INPUT',400);
  const kind=body.action==='version-action'?'version':body.action==='exception-action'?'exception':body.action==='retire-policy'?'retire':null;
  if(!kind)throw new PolicyDecisionError('POLICY_DECISION_INPUT',400);
  const c=await readPolicyDecision(db,kind,body[kind==='version'?'versionId':kind==='exception'?'exceptionId':'policyId']);
  if(c.revision!==body.expectedRevision)throw new PolicyDecisionError('POLICY_SOURCE_CHANGED',409);
  const live=await db.prepare('SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id||'').first<Row>();
  if(!live||live.status!=='Active'||!['Admin','Editor'].includes(String(live.role))||live.role!==actor.role||String(live.email).toLowerCase()!==actor.email.toLowerCase()||(live.role!=='Admin'&&parseModuleAccess(live.policy_json===null?null:String(live.policy_json)).mode!=='full'))throw new PolicyDecisionError('POLICY_DECISION_ACCESS',403);
  return joinWorkflowGuards(rowGuard(tables[kind],c.record),rowGuard('policy_documents',c.policy),rowGuard('policy_versions',c.version),{sql:"EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)",values:[live.id,live.email,live.role,live.policy_json]});
}
