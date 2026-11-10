import {FULL_ACCESS,parseModuleAccess,validateModuleAccess,type ModuleAccess} from "../../module-access";
import type {Actor} from "../auth/security";

type ActorKey=Pick<Actor,"id"|"email">;
type Values={id:string;name:string;email:string;role:string;status:string;policy_json:string|null};
type State=Omit<Values,"policy_json">&{moduleAccess:ModuleAccess};
export class AccountError extends Error {
 constructor(public code:string,public status:number,message:string){super(message);}
}
const conflict=()=>new AccountError("stale",409,"Hesap veya yönetici yetkisi değişti. Listeyi yenileyin.");
const lastAdmin=()=>new AccountError("last-admin",409,"Son aktif yönetici devre dışı bırakılamaz, silinemez veya rolü düşürülemez.");
const invalid=()=>new AccountError("invalid",400,"Geçersiz kullanıcı değişikliği.");
const roles=["Admin","Editor","Viewer"];
const liveAdmin="EXISTS(SELECT 1 FROM local_users manager WHERE manager.id=? AND manager.email=? AND manager.role='Admin' AND manager.status='Active')";
const enoughAdmins="(u.role!='Admin' OR u.status!='Active' OR EXISTS(SELECT 1 FROM local_users other WHERE other.id!=u.id AND other.role='Admin' AND other.status='Active'))";
export const accountFields="u.id,u.name,u.email,u.role,u.status,a.policy_json";
const directory="FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id";
function accessFor(role:string,value:unknown){
 const access=validateModuleAccess(value);
 if(!access||(role==="Admin"&&access.mode!=="full"))throw invalid();
 if(role==="Viewer"&&access.mode==="scoped")for(const module of Object.keys(access.modules) as (keyof typeof access.modules)[])access.modules[module]="read";
 return access;
}
function publicState(row:Values):State{
 return {id:row.id,name:row.name,email:row.email,role:row.role,status:row.status,moduleAccess:parseModuleAccess(row.policy_json)};
}
function revision(state:State){return JSON.stringify([state.name,state.role,state.status,state.moduleAccess]);}
export function directoryEntry(row:Values&{failed_attempts?:number;locked_until?:string;created_at?:string}){
 const state=publicState(row);return {...state,failed_attempts:row.failed_attempts,locked_until:row.locked_until,created_at:row.created_at,revision:revision(state)};
}
const eventExists="EXISTS(SELECT 1 FROM user_access_events WHERE id=?)";

export async function createAccount(db:D1Database,actor:ActorKey,body:Record<string,unknown>,credentials:{hash:string;salt:string;iterations:number}){
 const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||email).trim(),role=String(body.role||"Viewer");
 if(!roles.includes(role)||!name||name.length>120||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw invalid();
 const moduleAccess=accessFor(role,body.moduleAccess===undefined?FULL_ACCESS:body.moduleAccess);
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const result=await db.batch([
  db.prepare(`INSERT INTO local_users(id,name,email,password_hash,password_salt,password_iterations,role,status,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,'Active',?,? WHERE ${liveAdmin} ON CONFLICT(email) DO NOTHING`).bind(id,name,email,credentials.hash,credentials.salt,credentials.iterations,role,now,now,actor.id,actor.email),
  db.prepare("INSERT INTO user_module_access(user_id,policy_json,updated_at,updated_by) SELECT ?,?,?,? WHERE changes()=1").bind(id,JSON.stringify(moduleAccess),now,actor.email),
  db.prepare("INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) SELECT ?,?,?,'null',?,? WHERE changes()=1").bind(crypto.randomUUID(),id,actor.email,JSON.stringify({operation:"create-local-account",name,email,role,status:"Active",moduleAccess}),now),
 ]);
 if(!result[0]?.meta?.changes){
  if(await db.prepare("SELECT id FROM local_users WHERE email=?").bind(email).first())throw new AccountError("duplicate",409,"Bu e-posta ile hesap zaten mevcut.");
  throw conflict();
 }
 return id;
}
export async function changeAccount(db:D1Database,actor:ActorKey,body:Record<string,unknown>,remove:boolean){
 const id=body.id;
 if(typeof id!=="string"||!id||id.length>100)throw invalid();
 const row=await db.prepare(`SELECT ${accountFields} ${directory} WHERE u.id=?`).bind(id).first<Values>();
 if(!row)throw new AccountError("missing",404,"Kullanıcı bulunamadı.");
 const previous=publicState(row);
 if(remove&&id===actor.id)throw new AccountError("self",409,"Kendi hesabınızı silemezsiniz.");
 if(remove&&(body.email!==row.email||typeof body.expectedRevision!=="string"))throw invalid();
 if(body.expectedRevision!==undefined&&body.expectedRevision!==revision(previous))throw conflict();
 if(!remove&&body.name!==undefined&&typeof body.name!=="string")throw invalid();
 const role=remove?row.role:body.role,status=remove?row.status:body.status,name=typeof body.name==="string"?body.name.trim():row.name;
 if(typeof role!=="string"||!roles.includes(role)||typeof status!=="string"||!["Active","Disabled"].includes(status)||!name||name.length>120)throw invalid();
 const moduleAccess=remove?previous.moduleAccess:accessFor(role,body.moduleAccess===undefined?(role==="Admin"?FULL_ACCESS:previous.moduleAccess):body.moduleAccess);
 const changed=role!==row.role||status!==row.status||JSON.stringify(moduleAccess)!==JSON.stringify(previous.moduleAccess);
 const eventId=(remove?"local-delete:":"")+crypto.randomUUID(),now=new Date().toISOString();
 const after=remove?{operation:"delete-local-account",email:row.email,name:row.name}:{operation:"update-local-account",email:row.email,name,role,status,moduleAccess};
 const needsOther=remove||role!=="Admin"||status!=="Active";
 // Claim the displayed state and recheck administrator authority and availability inside the transaction.
 const claim=db.prepare(`INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at)
  SELECT ?,?,?,?,?,? ${directory} WHERE u.id=? AND u.name=? AND u.role=? AND u.status=? AND a.policy_json IS ? AND ${liveAdmin} AND ${needsOther?enoughAdmins:"1"}`)
  .bind(eventId,id,actor.email,JSON.stringify(previous),JSON.stringify(after),now,id,row.name,row.role,row.status,row.policy_json,actor.id,actor.email);
 const steps=[claim];
 if(remove||changed)steps.push(db.prepare(`DELETE FROM local_sessions WHERE user_id=? AND ${eventExists}`).bind(id,eventId));
 if(remove){
  steps.push(db.prepare(`DELETE FROM user_module_access WHERE user_id=? AND ${eventExists}`).bind(id,eventId),
   db.prepare(`DELETE FROM local_users WHERE id=? AND ${eventExists}`).bind(id,eventId));
 }else{
  steps.push(db.prepare(`UPDATE local_users SET name=?,role=?,status=?,failed_attempts=CASE WHEN ?='Active' THEN 0 ELSE failed_attempts END,locked_until=CASE WHEN ?='Active' THEN NULL ELSE locked_until END,updated_at=? WHERE id=? AND ${eventExists}`).bind(name,role,status,status,status,now,id,eventId),
   db.prepare(`INSERT INTO user_module_access(user_id,policy_json,updated_at,updated_by) SELECT ?,?,?,? WHERE ${eventExists} ON CONFLICT(user_id) DO UPDATE SET policy_json=excluded.policy_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(id,JSON.stringify(moduleAccess),now,actor.email,eventId));
 }
 const result=await db.batch(steps);
 if(!result[0]?.meta?.changes){
  if(needsOther&&row.role==="Admin"&&row.status==="Active"&&!await db.prepare("SELECT id FROM local_users WHERE id!=? AND role='Admin' AND status='Active' LIMIT 1").bind(id).first())throw lastAdmin();
  throw conflict();
 }
 return {ok:true,accessChanged:changed};
}
