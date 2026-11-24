import type {Actor} from '../api/auth/security';
import {canReadModule,canWriteModule} from '../module-access';
import {event,EnterpriseError,assertInput} from './http';
import {editableField,validFieldValue} from './editor';
import {readEstimate} from './fair';
import {grantedTree,canManage} from './scope';
export const kinds={risk:'Risk Assessment',asset:'Varlık Envanteri',bia:'BIA',vendor:'Tedarikçiler',control:'Kontroller',policy:'Politika Merkezi',audit:'Denetim Yönetimi',finding:'Bulgular ve CAPA',incident:'Güvenlik Olayları'} as const;
type Kind=keyof typeof kinds;
type Source={table:string;id:string;title:string;state:string;native:string;key:string;condition?:string};
const core=(module:string,title:string):Source=>({table:'simple_grc_records',id:'r.id',title:`json_extract(r.data_json,'$.${title}')`,state:"json_extract(r.data_json,'$.status')",native:'r.id',key:'r.id',condition:`r.module='${module}'`});
const sources:Record<Kind,Source>={
 risk:core(kinds.risk,'title'),asset:core(kinds.asset,'title'),bia:core(kinds.bia,'process'),vendor:core(kinds.vendor,'title'),control:core(kinds.control,'controlTitle'),
 policy:{table:'policy_documents',id:'r.id',title:'r.title',state:'r.status',native:'r.code',key:'r.id'},
 audit:{table:'simple_audits',id:'r.id',title:'r.name',state:'r.status',native:'r.id',key:"'enterprise:audit:'||r.id"},
 finding:{table:'enterprise_findings',id:'r.id',title:'r.title',state:'r.status',native:'r.code',key:"'work:finding:'||r.id"},
 incident:{table:'enterprise_incidents',id:'r.id',title:'r.title',state:'r.status',native:'r.code',key:"'enterprise:incident:'||r.id"}
};
const prefixes:Record<Kind,string>={risk:'RSK',asset:'AST',bia:'BIA',vendor:'VEN',control:'CTL',policy:'POL',audit:'AUD',finding:'FND',incident:'INC'};
export function recordKind(v:unknown):Kind{assertInput(typeof v==='string'&&Object.hasOwn(kinds,v));return v as Kind;}
function canView(user:Actor,k:Kind){return canReadModule(user,kinds[k]);}
async function sourceSql(db:D1Database,k:Kind){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?)").bind(sources[k].table,'third_party_profiles','simple_grc_record_codes').all<{name:string}>()).results.map(t=>t.name);
 let list=tables.includes(sources[k].table)?[sources[k]]:[];
 if(k==='vendor'&&tables.includes('third_party_profiles')){
  list=list.map(s=>({...s,condition:s.condition+' AND NOT EXISTS(SELECT 1 FROM third_party_profiles p WHERE p.vendor_id=r.id)'}));
  list.push({table:'third_party_profiles',id:'r.vendor_id',title:'r.name',state:'r.status',native:'r.vendor_id',key:'r.vendor_id'});
 }
 return list.map(s=>{
  const f=editableField(k,s.table),value=f.storage==='json'?`json_extract(r.data_json,'$.${f.column}')`:'r.'+f.column;
  const stages=f.states.map(v=>"'"+v+"'").join(',');
  return `SELECT ${s.id} id,${s.title} title,${s.state} status,${s.native} native,${s.key} registry,
   '${s.table}' source, CASE WHEN ${s.state} IN (${stages}) THEN '${f.field}' END field,
   ${f.actorColumn?'r.'+f.actorColumn:"''"} editor,coalesce(${value},'') field_value,
   ${k==='risk'?"json_extract(r.data_json,'$.fairLite')":"NULL"} estimate FROM ${s.table} r WHERE ${s.condition||'1'}`
 }).join(' UNION ALL ');
}
function access(user:Actor){
 const selected=user.orgScope?.selected;
 const values:string[]=[];
 const rules:string[]=[];
 if(!user.orgScope?.group){rules.push("coalesce(o.org_entity_id,'root') IN (SELECT id FROM granted)");values.push(user.id);}
 if(selected){rules.push("coalesce(o.org_entity_id,'root') IN (WITH RECURSIVE branch(id) AS (SELECT id FROM org_entities WHERE id=? UNION SELECT e.id FROM org_entities e JOIN branch b ON e.parent_id=b.id) SELECT id FROM branch)");values.push(selected);}
 return {cte:user.orgScope?.group?'':grantedTree,where:rules.join(' AND ')||'1',values};
}
export async function listRecords(db:D1Database,user:Actor,k:Kind,offset:number){
 if(!canView(user,k))throw new EnterpriseError(403,'scope');
 const src=await sourceSql(db,k);if(!src)return {rows:[],more:false};
 const a=access(user),prefix=prefixes[k],valid=(expr:string)=>`${expr} GLOB '${prefix}-[0-9][0-9][0-9]*' AND substr(${expr},5) NOT GLOB '*[^0-9]*'`;
 const rows=(await db.prepare(`${a.cte} SELECT x.id,x.title,x.status,x.estimate,x.source,x.field_value,CASE WHEN x.editor='' OR lower(x.editor)=lower(?) OR ?=1 THEN x.field END field,coalesce(o.org_entity_id,'root') org_entity_id,coalesce(o.note,'') note,coalesce(o.revision,'') revision,
 CASE WHEN ${valid('c.code')} THEN c.code WHEN ${valid('alias.code')} THEN alias.code WHEN ${valid('x.native')} THEN x.native ELSE NULL END code
 FROM (${src}) x LEFT JOIN org_record_entities o ON o.kind='${k}' AND o.record_id=x.id
 LEFT JOIN simple_grc_record_codes c ON c.record_id=x.registry LEFT JOIN simple_grc_record_codes alias ON alias.record_id='map:display:'||x.registry
 WHERE ${a.where} ORDER BY x.title,x.id LIMIT 101 OFFSET ?`).bind(...(a.cte?[user.id]:[]),user.email,canManage(user)?1:0,...(user.orgScope?.selected?[user.orgScope.selected]:[]),offset).all()).results;
 return {rows:rows.slice(0,100),more:rows.length>100};
}
export async function updateRecord(db:D1Database,user:Actor,b:Record<string,unknown>){
 const k=recordKind(b.kind),src=await sourceSql(db,k);
 assertInput(typeof b.id==='string'&&b.id.length<=240&&typeof b.revision==='string'&&typeof b.note==='string'&&b.note.length<=4000&&typeof b.entity==='string');
 if(!src||!canView(user,k)||!canWriteModule(user,kinds[k]))throw new EnterpriseError(403,'scope');
 const a=access(user),rev=crypto.randomUUID(),manager=canManage(user);
 const changeEstimate=k==='risk'&&Object.hasOwn(b,'fairLite');
 const estimate=changeEstimate?readEstimate(b.fairLite):null;
 if(changeEstimate)assertInput((b.fairLite===null||estimate)&&(typeof b.previousEstimate==='string'||b.previousEstimate===null));
 const fieldEdit=b.fieldEdit as undefined|{source:string;field:string;previous:string;value:string};
 let native:D1PreparedStatement|undefined;
 if(fieldEdit!==undefined){
  assertInput(fieldEdit&&[sources[k].table,...(k==='vendor'?['third_party_profiles']:[])].includes(fieldEdit.source));
  const f=editableField(k,fieldEdit.source);
  assertInput(fieldEdit.field===f.field&&typeof fieldEdit.previous==='string'&&validFieldValue(f.field,fieldEdit.value));
  if(['finding','incident'].includes(k))assertInput(fieldEdit.value.trim());
  const key=fieldEdit.source==='third_party_profiles'?'vendor_id':'id',now=new Date().toISOString();
  const set=f.storage==='json'?`data_json=json_set(data_json,'$.${f.column}',?)`:`${f.column}=?`;
  native=db.prepare(`UPDATE ${fieldEdit.source} SET ${set},updated_at=? WHERE ${key}=? AND EXISTS(SELECT 1 FROM org_record_entities WHERE kind=? AND record_id=? AND revision=?)`).bind(fieldEdit.value.trim(),now,b.id,k,b.id,rev);
 }
 const q=`${a.cte} INSERT INTO org_record_entities(kind,record_id,org_entity_id,note,revision)
 SELECT '${k}',x.id,?,?,? FROM (${src}) x LEFT JOIN org_record_entities o ON o.kind='${k}' AND o.record_id=x.id
 WHERE x.id=? AND coalesce(o.revision,'')=? AND (${a.where})
 ${fieldEdit?"AND x.source=? AND x.field=? AND x.field_value=? AND (x.editor='' OR lower(x.editor)=lower(?) OR ?=1)":''}
 ${changeEstimate?'AND x.estimate IS ?':''} AND EXISTS(SELECT 1 FROM org_entities WHERE id=?) AND (?=1 OR coalesce(o.org_entity_id,'root')=?)
 ON CONFLICT(kind,record_id) DO UPDATE SET org_entity_id=excluded.org_entity_id,note=excluded.note,revision=excluded.revision`;
 const bindings=[...(a.cte?[user.id]:[]),b.entity,b.note.trim(),rev,b.id,b.revision,...(user.orgScope?.selected?[user.orgScope.selected]:[]),...(fieldEdit?[fieldEdit.source,fieldEdit.field,fieldEdit.previous,user.email,manager?1:0]:[]),...(changeEstimate?[b.previousEstimate]:[]),b.entity,manager?1:0,b.entity];
 const financial=changeEstimate?[db.prepare(`UPDATE simple_grc_records SET data_json=CASE WHEN ? IS NULL THEN json_remove(data_json,'$.fairLite') ELSE json_set(data_json,'$.fairLite',json(?)) END,updated_at=?
 WHERE id=? AND module='Risk Assessment' AND EXISTS(SELECT 1 FROM org_record_entities WHERE kind='risk' AND record_id=? AND revision=?) AND json_extract(data_json,'$.fairLite') IS NOT ?`).bind(estimate?JSON.stringify(estimate):null,JSON.stringify(estimate),new Date().toISOString(),b.id,b.id,rev,estimate?JSON.stringify(estimate):null)]:[];
 const result=await db.batch([db.prepare(q).bind(...bindings),event(db,user.email,'org-record-update',JSON.stringify({kind:k,id:b.id,entity:b.entity,revision:rev}),'changes()=1'),...(native?[native]:[]),...financial]);
 if(!result[0].meta?.changes)throw new EnterpriseError(409,'conflict');
}
