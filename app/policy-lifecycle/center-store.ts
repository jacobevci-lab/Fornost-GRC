import {completedInitialization} from '../completed-initialization';
import {ensureCoreGrcSchemaCompatibility} from '../api/grc/schema-compat';
import {connectedTitle} from '../connected-grc-model';
import {CoreReferenceUnavailable} from '../core-reference-write';
import {lifecycleInsert} from '../enterprise-lifecycle-write';

import {ensureCatalogs} from "../catalog-store";

const moduleName='Politika Merkezi';
const numericCode=(column:string)=>`${column} GLOB 'POL-[0-9][0-9][0-9]*' AND substr(${column},5) NOT GLOB '*[^0-9]*' AND length(${column})<=17`;
const numeric=numericCode("code");
const maxNumber=`SELECT COALESCE(MAX(n),0) FROM (
 SELECT CAST(substr(code,5) AS INTEGER) n FROM simple_grc_record_codes WHERE ${numeric}
 UNION ALL SELECT CAST(substr(code,5) AS INTEGER) FROM policy_documents WHERE ${numeric}
 UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='${moduleName}')`;
export const nextPolicyCode=`SELECT printf('POL-%03d',1+(${maxNumber}))`;
const linksTable=`CREATE TABLE IF NOT EXISTS policy_exception_connections (
 exception_id TEXT PRIMARY KEY NOT NULL,scope_kind TEXT NOT NULL,scope_ref TEXT NOT NULL,control_refs TEXT NOT NULL DEFAULT '[]',risk_ref TEXT)`;
const legacyCodes=`INSERT OR IGNORE INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT id,'${moduleName}',code,created_at FROM policy_documents WHERE ${numeric}`;
const backfill=`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT id,'${moduleName}',printf('POL-%03d',(${maxNumber})+row_number() OVER(ORDER BY created_at,id)),created_at
 FROM policy_documents p WHERE NOT EXISTS(SELECT 1 FROM simple_grc_record_codes c WHERE c.record_id=p.id)`;
const allocation=`CREATE TRIGGER IF NOT EXISTS policy_register_short_code AFTER INSERT ON policy_documents BEGIN
 INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(NEW.id,'${moduleName}',
 CASE WHEN ${numericCode("NEW.code")} THEN NEW.code ELSE (${nextPolicyCode}) END,NEW.created_at);
 INSERT INTO simple_grc_record_code_counters(module,value,updated_at)
 SELECT '${moduleName}',CAST(substr(code,5) AS INTEGER),NEW.created_at FROM simple_grc_record_codes WHERE record_id=NEW.id
 ON CONFLICT(module) DO UPDATE SET value=max(value,excluded.value),updated_at=excluded.updated_at;
 END`;
export const centerSchema=[linksTable,legacyCodes,backfill,allocation];
const initialized=completedInitialization();
export async function ensurePolicyCenter(db:D1Database){
 await initialized(db,async()=>{
  await ensureCoreGrcSchemaCompatibility(db);
  const installed=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='policy_register_short_code'").first();
  if(!installed)await db.batch(centerSchema.map(sql=>db.prepare(sql)));
 });
}
export const policyKpiSql=`SELECT
 (SELECT count(*) FROM policy_documents WHERE status='published') published,
 (SELECT count(*) FROM policy_versions v JOIN policy_documents p ON p.id=v.policy_id WHERE v.status='review' AND p.status NOT IN ('retired','cancelled')) awaitingReview,
 (SELECT count(*) FROM policy_attestation_campaigns WHERE status='open') activeCampaigns,
 (SELECT count(*) FROM policy_exceptions WHERE status='approved' AND expires_at>=date('now')) activeExceptions`;
const unitsSql="SELECT value AS unit FROM grc_catalog_values WHERE catalog='businessUnits'";
export async function businessUnits(db:D1Database,q:string){
 await ensureCatalogs(db);
 const rows=await db.prepare('SELECT unit FROM ('+unitsSql+') WHERE instr(lower(unit),lower(?))>0 ORDER BY unit LIMIT 51').bind(q.slice(0,160)).all<{unit:string}>();
 return {units:rows.results.slice(0,50).map(r=>r.unit),more:rows.results.length>50};
}
const modules={asset:'Varlık Envanteri',vendor:'Tedarikçiler',control:'Kontroller',risk:'Risk Assessment'} as const;
function validRef(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=160;}
function recordsGuard(refs:[string,string][]){
 return {sql:`NOT EXISTS (SELECT 1 FROM json_each(?) item WHERE NOT EXISTS
 (SELECT 1 FROM simple_grc_records r WHERE r.id=json_extract(item.value,'$[0]') AND r.module=json_extract(item.value,'$[1]')))`,values:[JSON.stringify(refs)]};
}
export async function exceptionConnections(db:D1Database,id:string,input:Record<string,unknown>){
 if(input.scopeKind===undefined&&input.scopeRef===undefined&&input.controlRefs===undefined)return null;
 const kind=input.scopeKind,ref=input.scopeRef,controls=input.controlRefs;
 if((kind!=='asset'&&kind!=='vendor'&&kind!=='unit')||!validRef(ref)||!Array.isArray(controls)||controls.length>50||!controls.every(validRef))throw new CoreReferenceUnavailable();
 const ids=Array.from(new Set(controls)),pairs:[string,string][]=ids.map(v=>[v,modules.control]);
 let scope=ref;
 if(kind!=='unit'){
  pairs.push([ref,modules[kind]]);
  const record=await db.prepare(`SELECT r.id,r.module,r.data_json,coalesce(c.code,r.id) code FROM simple_grc_records r
   LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.id=? AND r.module=?`).bind(ref,modules[kind]).first<{id:string;module:string;code:string;data_json:string}>();
  if(!record)throw new CoreReferenceUnavailable();
  const title=connectedTitle({...record,data:JSON.parse(record.data_json)});
  scope=title===record.code?title:record.code+' · '+title;
 }
 const guard=recordsGuard(pairs);
 if(kind==='unit'){await ensureCatalogs(db);guard.sql+=' AND EXISTS(SELECT 1 FROM ('+unitsSql+') WHERE unit=?)';guard.values.push(ref);}
 return {scope,guard,write:lifecycleInsert(db,'policy_exception_connections',{exception_id:id,scope_kind:kind,scope_ref:ref,control_refs:JSON.stringify(ids),risk_ref:null})};
}
export function approvedRisk(db:D1Database,id:string,op:string,ref:unknown){
 if(ref===undefined||ref==='')return null;
 if(op!=='approve-exception'||!validRef(ref))throw new CoreReferenceUnavailable();
 return {guard:recordsGuard([[ref,modules.risk]]),write:db.prepare(`INSERT INTO policy_exception_connections(exception_id,scope_kind,scope_ref,control_refs,risk_ref)
 SELECT ?,'legacy','','[]',? WHERE changes()=1 ON CONFLICT(exception_id) DO UPDATE SET risk_ref=excluded.risk_ref`).bind(id,ref)};
}
export const shortCodeFor=(alias:string)=>`COALESCE((SELECT code FROM simple_grc_record_codes pc WHERE pc.record_id=${alias}.id),${alias}.code)`;
