import {NextRequest} from 'next/server';
import {requireRole,identityDb,requestIsSecure} from '../../auth/security';
import {readBoundedJsonObject} from '../../request-body';
import {visibleEntities,canManage,orgCookie,orgRoles} from '../../../enterprise/scope';
import {reply,failure,assertInput,event} from '../../../enterprise/http';
import {BASE_PATH} from '../../../base-path';
import {kinds} from '../../../enterprise/register';
import {canReadModule,canWriteModule} from '../../../module-access';
export async function GET(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor','Viewer']);if(a.response)return a.response;
 const db=await identityDb(),entities=await visibleEntities(db,a.actor);
 const users=canManage(a.actor)&&req.nextUrl.searchParams.get("manage")==="1"?(await db.prepare(`SELECT u.id,u.name,u.email,u.role platformRole,r.role,r.revision,
 (SELECT json_group_array(org_entity_id) FROM org_memberships WHERE user_id=u.id) memberships
 FROM local_users u LEFT JOIN org_user_roles r ON r.user_id=u.id WHERE u.status='Active' ORDER BY u.name`).all()).results:[];
 return reply({scope:a.actor.orgScope,entities,users,self:a.actor.id,
 readable:Object.entries(kinds).filter(([,v])=>canReadModule(a.actor,v)).map(([k])=>k),
 writable:Object.entries(kinds).filter(([,v])=>canWriteModule(a.actor,v)).map(([k])=>k),manage:canManage(a.actor)});
}
export async function POST(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor','Viewer']);if(a.response)return a.response;
 try{
 const b=await readBoundedJsonObject(req,16000),db=await identityDb();
 if(b.action==='select'){
  const entities=await visibleEntities(db,a.actor);const id=b.entity;
  if(id!==null&&!entities.some(e=>e.id===id))return reply({code:'scope'},403);
  const out=reply({ok:true});out.cookies.set(orgCookie,typeof id==='string'?id:'',{path:BASE_PATH||'/',httpOnly:true,sameSite:'strict',secure:requestIsSecure(req),maxAge:id?2592000:0});return out;
 }
 if(!canManage(a.actor))return reply({code:'scope'},403);
 if(b.action==='entity'){
  assertInput(typeof b.name==='string'&&b.name.trim().length>0&&b.name.trim().length<=120);
  const kinds:Record<string,string[]>={company:['holding'],subsidiary:['holding','company','subsidiary'],unit:['holding','company','subsidiary','unit']};
  assertInput(typeof b.kind==='string'&&Object.hasOwn(kinds,b.kind)&&typeof b.parent==='string');
  const id=crypto.randomUUID(),result=await db.batch([db.prepare(`INSERT OR IGNORE INTO org_entities(id,parent_id,kind,name)
   SELECT ?,id,?,? FROM org_entities WHERE id=? AND kind IN(SELECT value FROM json_each(?))`).bind(id,b.kind,b.name.trim(),b.parent,JSON.stringify(kinds[b.kind])),event(db,a.actor.email,'org-create',id,'changes()=1')]);
  return result[0].meta?.changes?reply({id},201):reply({code:'conflict'},409);
 }
 if(b.action==='grant'){
  const {user,role,entities,revision}=b;
  assertInput(typeof user==='string'&&user!==a.actor.id&&typeof role==='string'&&orgRoles.some(r=>r===role)&&Array.isArray(entities)&&entities.length<=100&&entities.every(e=>typeof e==='string')&&typeof revision==='string');
  const scopes=JSON.stringify([...new Set(entities)]),stamp=crypto.randomUUID();
  if(role.startsWith('group-')&&entities.length)return reply({code:'input'},400);
  const applied="EXISTS(SELECT 1 FROM org_user_roles WHERE user_id=? AND revision=?)";
  const r=await db.batch([db.prepare(`INSERT INTO org_user_roles(user_id,role,revision)
   SELECT u.id,?,? FROM local_users u WHERE u.id=? AND u.status='Active' AND (?<>'group-admin' OR u.role='Admin')
   AND COALESCE((SELECT revision FROM org_user_roles WHERE user_id=u.id),'')=?
   AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM org_entities WHERE id=j.value))
   ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,revision=excluded.revision`).bind(role,stamp,user,role,revision,scopes),
   event(db,a.actor.email,'org-grant',JSON.stringify({user,role,entities}),'changes()=1'),
   db.prepare('DELETE FROM org_memberships WHERE user_id=? AND '+applied).bind(user,user,stamp),
   db.prepare('INSERT INTO org_memberships SELECT ?,value FROM json_each(?) WHERE '+applied).bind(user,scopes,user,stamp)]);
  return r[0].meta?.changes?reply({ok:true}):reply({code:'conflict'},409);
 }
 return reply({code:'input'},400);
 }catch(e){return failure(e)}
}
