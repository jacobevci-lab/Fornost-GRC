import {assertInput,EnterpriseError,event} from './http';

export const scimUser='urn:ietf:params:scim:schemas:core:2.0:User';
export const scimEnterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export type DirectoryRule={attribute:'department'|'group';value:string;entity:string;role:'entity-manager'|'contributor'};
export function readRules(input:unknown):DirectoryRule[]{
 assertInput(Array.isArray(input)&&input.length<=100);
 const seen=new Set<string>();
 return input.map(r=>{
  assertInput(r&&['department','group'].includes(r.attribute)&&typeof r.value==='string'&&r.value.trim().length>0&&r.value.length<=160&&typeof r.entity==='string'&&r.entity.length<=100&&['entity-manager','contributor'].includes(r.role));
  const key=r.attribute+'/'+r.value.trim().toLowerCase();
  assertInput(!seen.has(key));seen.add(key);
  return {attribute:r.attribute,value:r.value.trim(),entity:r.entity,role:r.role};
 });
}
export function previewUser(resource:Record<string,unknown>,rules:DirectoryRule[]){
 assertInput(Array.isArray(resource.schemas)&&resource.schemas.includes(scimUser)&&typeof resource.userName==='string'&&resource.userName.trim().length>0&&resource.userName.length<=320);
 const extension=resource[scimEnterprise] as {department?:unknown}|undefined;
 const groups=resource.groups??[];
 assertInput(Array.isArray(groups)&&groups.length<=100&&groups.every(g=>g&&typeof g.value==='string'));
 const norm=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';
 const matches=resource.active===false?[]:rules.filter(r=>r.attribute==='department'?norm(r.value)===norm(extension?.department):groups.some(g=>norm(g.value)===norm(r.value)));
 const roles=new Set(matches.map(r=>r.role));
 return {simulation:true,result:roles.size>1?'conflict':!roles.size?'unmapped':'matched',role:roles.size===1?matches[0].role:null,entities:roles.size===1?[...new Set(matches.map(r=>r.entity))]:[]};
}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function digestToken(token:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));}
export async function tokenValid(db:D1Database,header:string|null){
 if(!header||!/^Bearer fscim_[a-f0-9]{64}$/i.test(header))return false;
 return !!await db.prepare('SELECT 1 FROM org_scim_tokens WHERE id=1 AND digest=?').bind(await digestToken(header.slice(7))).first();
}
export async function directory(db:D1Database){
 const row=await db.prepare('SELECT config,revision FROM org_directory_config WHERE id=1').first<{config:string;revision:string}>();
 const active=await db.prepare('SELECT created_at FROM org_scim_tokens WHERE id=1').first<{created_at:string}>();
 return {rules:row?readRules(JSON.parse(row.config)):[],revision:row?.revision||'',tokenRevision:active?.created_at||''};
}
export async function writeDirectory(db:D1Database,email:string,b:Record<string,unknown>){
 assertInput(typeof b.revision==='string');
 const stamp=crypto.randomUUID();let token:string|undefined;
 let statement:D1PreparedStatement;
 if(b.action==='rules'){
  const rules=JSON.stringify(readRules(b.rules));
  statement=db.prepare(`INSERT INTO org_directory_config SELECT 1,?,? WHERE
  coalesce((SELECT revision FROM org_directory_config WHERE id=1),'')=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM org_entities WHERE id=json_extract(j.value,'$.entity')))
  ON CONFLICT(id) DO UPDATE SET config=excluded.config,revision=excluded.revision`).bind(rules,stamp,b.revision,rules);
 }else if(b.action==='rotate'){
  token='fscim_'+hex(crypto.getRandomValues(new Uint8Array(32)));
  statement=db.prepare(`INSERT INTO org_scim_tokens SELECT 1,?,? WHERE coalesce((SELECT created_at FROM org_scim_tokens WHERE id=1),'')=?
  ON CONFLICT(id) DO UPDATE SET digest=excluded.digest,created_at=excluded.created_at`).bind(await digestToken(token),new Date().toISOString()+'#'+stamp,b.revision);
 }else if(b.action==='revoke'){
  statement=db.prepare('DELETE FROM org_scim_tokens WHERE id=1 AND created_at=?').bind(b.revision);
 }else throw new EnterpriseError(400,'input');
 const [written]=await db.batch([statement,event(db,email,'directory-'+b.action,'directory','changes()=1')]);
 if(!written.meta?.changes)throw new EnterpriseError(409,'conflict');
 return token?{token}:{ok:true};
}
