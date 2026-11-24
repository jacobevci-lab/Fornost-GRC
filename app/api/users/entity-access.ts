import type { OrgRole, Entity } from '../../enterprise/scope';
import { AccountError } from './account-store';
export type EntityAccess={role:OrgRole;entities:string[];revision:string};
export const entityFields="(SELECT role FROM org_user_roles WHERE user_id=u.id) org_role, (SELECT revision FROM org_user_roles WHERE user_id=u.id) org_revision, (SELECT json_group_array(org_entity_id) FROM org_memberships WHERE user_id=u.id ORDER BY org_entity_id) org_entities";
export function entityAccess(row:{role:string;org_role?:OrgRole;org_revision?:string;org_entities?:string},singleEntity=false):EntityAccess {
 return {role:row.org_role||(row.role==='Admin'?'group-admin':'contributor'),entities:row.org_role?JSON.parse(row.org_entities||'[]'):row.role==='Admin'?[]:singleEntity?['root']:[],revision:row.org_revision||''};
}
export function parseEntityAccess(value:unknown,platformRole:string):EntityAccess {
 const v=value as EntityAccess;
 if(!v||!['group-admin','group-ciso','entity-manager','contributor'].includes(v.role)||typeof v.revision!=='string'||!Array.isArray(v.entities)||v.entities.length>100||v.entities.some(x=>typeof x!=='string'||!x||x.length>100)||new Set(v.entities).size!==v.entities.length||(['group-admin','group-ciso'].includes(v.role)&&v.entities.length)||v.role==='group-admin'&&platformRole!=='Admin')throw new AccountError('invalid',400,'Geçersiz iştirak kapsamı.');
 return {...v,entities:[...v.entities].sort()};
}
export function grantGuard(actorId:string,id:string,access:EntityAccess){
 return {sql:`COALESCE((SELECT role FROM org_user_roles WHERE user_id=?),'group-admin')='group-admin' AND COALESCE((SELECT revision FROM org_user_roles WHERE user_id=?),'')=? AND (SELECT COUNT(*) FROM org_entities WHERE id IN (SELECT value FROM json_each(?)))=?`,values:[actorId,id,access.revision,JSON.stringify(access.entities),access.entities.length]};
}
export function grantSteps(db:D1Database,id:string,access:EntityAccess,eventId:string){
 const guard='EXISTS(SELECT 1 FROM user_access_events WHERE id=?)';
 return [db.prepare(`INSERT INTO org_user_roles(user_id,role,revision) SELECT ?,?,? WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,revision=excluded.revision`).bind(id,access.role,crypto.randomUUID(),eventId),db.prepare(`DELETE FROM org_memberships WHERE user_id=? AND ${guard}`).bind(id,eventId),...access.entities.map(entity=>db.prepare(`INSERT INTO org_memberships(user_id,org_entity_id) SELECT ?,? WHERE ${guard}`).bind(id,entity,eventId))];
}
export type {Entity};
