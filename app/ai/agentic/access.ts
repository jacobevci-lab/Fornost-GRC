import type { Actor } from '../../api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from '../../module-access';
import { resolveScope, visibleEntities } from '../../enterprise/scope';
import { checkAiAccess } from '../operating-policy';
import { AgenticError } from './common';
export async function agentActor(db:D1Database,actor:Actor,write=false){
 const u=await db.prepare('SELECT u.id,u.email,u.name,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id).first<{id:string;email:string;name:string;role:Actor['role'];status:string;policy_json:string|null}>();
 if(!u||u.status!=='Active'||u.email.toLowerCase()!==actor.email.toLowerCase()||write&&!['Admin','Editor'].includes(u.role))throw new AgenticError('AI_SCOPE',403);
 const live:Actor={id:u.id,email:u.email,name:u.name,role:u.role,source:actor.source,moduleAccess:parseModuleAccess(u.policy_json)};
 live.orgScope=await resolveScope(db,live,actor.orgScope?.selected||undefined);
 if(!(await checkAiAccess(db,live.role,write?'agents':'chat')).allowed||write&&!(await checkAiAccess(db,live.role,'drafts')).allowed)throw new AgenticError('AI_OPERATION_BLOCKED',403);
 return live;
}
export async function entityIds(db:D1Database,actor:Actor):Promise<string[]|null>{
 if(actor.orgScope?.group&&!actor.orgScope.selected)return null;
 const visible=await visibleEntities(db,actor),selected=actor.orgScope?.selected;
 if(!selected)return visible.map(e=>e.id);
 const descendants=new Set([selected]);let changed=true;
 while(changed){changed=false;for(const e of visible)if(e.parent_id&&descendants.has(e.parent_id)&&!descendants.has(e.id)){descendants.add(e.id);changed=true;}}
 return visible.filter(e=>descendants.has(e.id)).map(e=>e.id);
}
export const requireModule=(actor:Actor,module:string,write=false)=>{if(!(write?canWriteModule(actor,module):canReadModule(actor,module)))throw new AgenticError('AI_SCOPE',403);};
// Capture every authority and mapping that can affect a proposal; compare inside the write transaction.
export const authoritySql=`SELECT json_object('user',(SELECT json_array(role,status,email) FROM local_users WHERE id=?),'module',(SELECT policy_json FROM user_module_access WHERE user_id=?),'role',(SELECT role FROM org_user_roles WHERE user_id=?),'members',(SELECT json_group_array(org_entity_id) FROM (SELECT org_entity_id FROM org_memberships WHERE user_id=? ORDER BY org_entity_id)),'tree',(SELECT json_group_array(json_array(id,parent_id)) FROM (SELECT id,parent_id FROM org_entities ORDER BY id)),'mapping',(SELECT json_group_array(json_array(kind,record_id,org_entity_id,revision)) FROM (SELECT kind,record_id,org_entity_id,revision FROM org_record_entities WHERE record_id IN(SELECT value FROM json_each(?)) ORDER BY kind,record_id))) snapshot`;
export async function authority(db:D1Database,actor:Actor,ids:string[]){const values=[actor.id,actor.id,actor.id,actor.id,JSON.stringify([...new Set(ids)].sort())];const row=await db.prepare(authoritySql).bind(...values).first<{snapshot:string}>();return {selected:actor.orgScope?.selected||null,snapshot:row!.snapshot,ids:JSON.parse(values[4]) as string[]};}
export function authorityGuard(actor:Actor,a:Awaited<ReturnType<typeof authority>>){if((actor.orgScope?.selected||null)!==a.selected)throw new AgenticError('AI_STALE',409);return {sql:`(${authoritySql})=?`,values:[actor.id,actor.id,actor.id,actor.id,JSON.stringify(a.ids),a.snapshot]};}
