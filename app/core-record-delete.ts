import {relationFields} from './connected-grc-model';
import {LifecycleConflict} from './enterprise-lifecycle-write';
import type {CoreRecordSnapshot} from './core-record-write';
import {enterpriseCoreReferences} from './enterprise-core-references';

export class CoreRecordLinked extends Error {
 constructor(){super('Bu kayda ID veya kod ile bağlı kayıtlar var. Önce bağlantıları kaldırın veya yeniden atayın.');}
}

// Exact IDs/codes in core rows and the explicitly registered enterprise sources are covered.
// Resolve references at DELETE time so an incoming link created after the initial read also blocks deletion.
function incomingReferences(module:string,enterpriseSelects:string[]){
 const rules=Object.entries(relationFields).filter(([,rule])=>rule.modules.includes(module)).map(([field,rule])=>({field,sources:rule.sources||null}));
 const sql=`WITH RECURSIVE raw(value) AS (
 SELECT part.value FROM simple_grc_records source
 JOIN json_each(?) rule
 JOIN json_each(CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END) field
 JOIN json_each(CASE WHEN field.type='array' THEN field.value ELSE json_array(field.value) END) part
 WHERE source.id<>? AND field.key=json_extract(rule.value,'$.field') AND part.type='text'
 AND (json_type(rule.value,'$.sources')='null' OR source.module IN (SELECT value FROM json_each(rule.value,'$.sources')))
 ${enterpriseSelects.length?' UNION ALL '+enterpriseSelects.join(' UNION ALL '):''}
 ), tokens(token,rest) AS (
 SELECT '',replace(replace(replace(replace(value,',',';'),'|',';'),char(10),';'),char(13),';')||';' FROM raw
 UNION ALL SELECT trim(substr(rest,1,instr(rest,';')-1)),substr(rest,instr(rest,';')+1) FROM tokens WHERE rest<>''
 ) SELECT 1 FROM tokens WHERE lower(token)=lower(?) OR lower(token) IN (SELECT lower(code) FROM simple_grc_record_codes WHERE record_id=?) LIMIT 1`;
 return{sql,rules:JSON.stringify(rules)};
}

export async function deleteCoreRecord(db:D1Database,id:string,existing:CoreRecordSnapshot&{module:string},expectedUpdatedAt:unknown){
 if(expectedUpdatedAt!==undefined){
  if(typeof expectedUpdatedAt!=='string'||!expectedUpdatedAt||expectedUpdatedAt.length>64)throw new Error('Invalid record version');
  if(expectedUpdatedAt!==existing.updated_at)throw new LifecycleConflict();
 }
 const enterprise=await enterpriseCoreReferences(db,existing.module);
 const guard=incomingReferences(existing.module,enterprise.selects),values=[guard.rules,id,id,id];
 const results=await db.batch([
  db.prepare(`DELETE FROM simple_grc_records WHERE id=? AND module=? AND data_json=? AND updated_at=? AND ${enterprise.schemaSql} AND NOT EXISTS (${guard.sql})`).bind(id,existing.module,existing.data_json,existing.updated_at,...enterprise.schemaValues,...values),
  db.prepare('DELETE FROM simple_grc_record_codes WHERE record_id=? AND changes()=1').bind(id),
 ]);
 if(Number(results[0]?.meta?.changes||0)!==1){
  if(await db.prepare(guard.sql).bind(...values).first())throw new CoreRecordLinked();
  throw new LifecycleConflict();
 }
}
