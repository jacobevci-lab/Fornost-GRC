import {ensureEnterprise} from './schema';
import type {Actor} from '../api/auth/security';
export type OrgRole='group-admin'|'group-ciso'|'entity-manager'|'contributor';
export type Scope={role:OrgRole|null;group:boolean;selected:string|null;restricted:boolean};
export type Entity={id:string;parent_id:string|null;name:string;kind:string};
export const orgRoles:OrgRole[]=['group-admin','group-ciso','entity-manager','contributor'];
// Explicit grants extend down the tree. UNION also bounds traversal of a damaged legacy hierarchy.
export const grantedTree=`WITH RECURSIVE granted(id) AS (
 SELECT org_entity_id FROM org_memberships WHERE user_id=?
 UNION SELECT e.id FROM org_entities e JOIN granted g ON e.parent_id=g.id)`;
export async function resolveScope(db:D1Database,user:Pick<Actor,'id'|'role'>,selected?:string):Promise<Scope>{
 await ensureEnterprise(db);
 const row=await db.prepare("SELECT (SELECT role FROM org_user_roles WHERE user_id=?) role, EXISTS(SELECT 1 FROM org_entities WHERE id<>'root') active").bind(user.id).first<{role:OrgRole|null;active:number}>();
 if(!row)throw new Error('scope unavailable');
 const role=row.role??(user.role==='Admin'?'group-admin':null);
 const group=role==='group-ciso'||(role==='group-admin'&&user.role==='Admin')||(!row.active&&!role);
 return {role,group,selected:selected||null,restricted:!group||!!selected};
}
export async function visibleEntities(db:D1Database,user:Actor){
 const group=user.orgScope?.group;
 return (group?await db.prepare("SELECT * FROM org_entities ORDER BY name,id").all<Entity>():
 await db.prepare(grantedTree+" SELECT e.* FROM org_entities e JOIN granted g ON e.id=g.id ORDER BY name,e.id").bind(user.id).all<Entity>()).results;
}
export function canManage(user:Actor){return user.role==='Admin'&&user.orgScope?.role==='group-admin'&&!user.orgScope.selected;}
export const orgCookie='fornost_org_entity';
export function scopeRoute(scope:Scope|undefined,path:string,method:string){
 if(!scope?.restricted)return true;
 return ['/api/enterprise/scope','/api/enterprise/records'].includes(path.replace(/\/+$/,'')) || (path==='/api/appearance'&&['GET','PUT'].includes(method));
}
