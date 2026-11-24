import type {Actor} from '../api/auth/security';
import {visibleEntities} from './scope';
import {EnterpriseError} from './http';
import {resolveScope} from './scope';
import {parseModuleAccess} from '../module-access';
export async function currentActor(db:D1Database,actor:Actor){
 const u=await db.prepare("SELECT u.id,u.name,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?").bind(actor.id).first<{id:string;name:string;email:string;role:Actor['role'];status:string;policy_json:string|null}>();
 if(!u||u.status!=='Active'||u.email.toLowerCase()!==actor.email.toLowerCase())throw new EnterpriseError(403,'scope');
 const live:Actor={...u,source:actor.source,moduleAccess:parseModuleAccess(u.policy_json)};
 live.orgScope=await resolveScope(db,live,actor.orgScope?.selected||undefined);
 if(live.orgScope.role==='group-ciso')live.role='Viewer';
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
// Capture every authority and mapping that can affect a proposal; compare inside the write transaction.
export const authoritySql=`SELECT json_object('user',(SELECT json_array(role,status,email) FROM local_users WHERE id=?),'module',(SELECT policy_json FROM user_module_access WHERE user_id=?),'role',(SELECT role FROM org_user_roles WHERE user_id=?),'members',(SELECT json_group_array(org_entity_id) FROM (SELECT org_entity_id FROM org_memberships WHERE user_id=? ORDER BY org_entity_id)),'tree',(SELECT json_group_array(json_array(id,parent_id)) FROM (SELECT id,parent_id FROM org_entities ORDER BY id)),'mapping',(SELECT json_group_array(json_array(kind,record_id,org_entity_id,revision)) FROM (SELECT kind,record_id,org_entity_id,revision FROM org_record_entities WHERE record_id IN(SELECT value FROM json_each(?)) ORDER BY kind,record_id))) snapshot`;
export async function authority(db:D1Database,actor:Actor,ids:string[]){const values=[actor.id,actor.id,actor.id,actor.id,JSON.stringify([...new Set(ids)].sort())];const row=await db.prepare(authoritySql).bind(...values).first<{snapshot:string}>();return {selected:actor.orgScope?.selected||null,snapshot:row!.snapshot,ids:JSON.parse(values[4]) as string[]};}
export function authorityGuard(actor:Actor,a:Awaited<ReturnType<typeof authority>>){if((actor.orgScope?.selected||null)!==a.selected)throw new EnterpriseError(409,'conflict');return {sql:`(${authoritySql})=?`,values:[actor.id,actor.id,actor.id,actor.id,JSON.stringify(a.ids),a.snapshot]};}
