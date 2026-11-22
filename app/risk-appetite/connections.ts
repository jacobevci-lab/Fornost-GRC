import type {Actor} from "../api/auth/security";
import {commitLifecycle,lifecycleClaim,lifecycleInsert,LifecycleConflict,nextLifecycleStamp} from "../enterprise-lifecycle-write";
import {joinWorkflowGuards,prepareWorkflowSelection} from "../workflow-selection-store";
import {validateRiskAppetite} from "./domain";
import {ensureCoreGrcSchemaCompatibility} from "../api/grc/schema-compat";

export const connectionSchema=[
  "CREATE TABLE IF NOT EXISTS risk_appetite_risk_links (appetite_id TEXT NOT NULL, risk_id TEXT NOT NULL, PRIMARY KEY(appetite_id,risk_id))",
  "CREATE INDEX IF NOT EXISTS risk_appetite_risk_idx ON risk_appetite_risk_links(risk_id,appetite_id)",
  "CREATE TABLE IF NOT EXISTS risk_kri_measurement_sources (measurement_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, evidence_id TEXT NOT NULL, version_id TEXT NOT NULL, version_no INTEGER NOT NULL)"
];
export {ensureCoreGrcSchemaCompatibility};
const moduleName="Risk İştahı ve KRI";
export const nextKriCodeSql=`SELECT printf('KRI-%03d',coalesce(max(n),0)+1) FROM (
  SELECT CAST(substr(code,5) AS INTEGER) n FROM (
    SELECT code FROM simple_grc_record_codes UNION ALL SELECT code FROM risk_appetite_statements
  ) WHERE upper(code) GLOB 'KRI-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'
  UNION ALL SELECT value FROM simple_grc_record_code_counters WHERE module='Risk İştahı ve KRI'
)`;

export class KriInputError extends Error {
  constructor(public code:string,public status=422){super(code)}
}
type Row=Record<string,string|number|null>;
function linkedIds(input:unknown){
  if(input===undefined)return undefined;
  if(!Array.isArray(input)||input.length>100||input.some(s=>typeof s!=="string"||!s||s.length>120))throw new KriInputError("KRI_RISKS");
  return [...new Set(input)] as string[];
}

export async function saveStatement(db:D1Database,actor:Actor,body:Record<string,unknown>){
  const refs=linkedIds(body.riskRefs),existingId=String(body.appetiteId||"");
  const old=existingId?await db.prepare("SELECT * FROM risk_appetite_statements WHERE id=?").bind(existingId).first<Row>():null;
  if(existingId&&!old)throw new KriInputError("KRI_MISSING",404);
  if(old && actor.role!=="Admin" && old.owner!==actor.email)throw new KriInputError("KRI_ACCESS",403);
  if(old && (!["draft","rejected"].includes(String(old.status)) || (body.expectedUpdatedAt!==undefined && old.updated_at!==body.expectedUpdatedAt)))throw new LifecycleConflict();
  const auto=!old&&(body.autoCode===true||!body.code);
  const x=validateRiskAppetite({...body,code:old?.code||(auto?"KRI-001":body.code)});
  const people=await prepareWorkflowSelection({DB:db},actor,{owner:x.owner,reviewer:x.reviewer,assignmentMode:"directory"},
    {owner:"writer",reviewer:"reviewer"},false,[String(old?.created_by||actor.email),x.owner]);
  const riskGuard=refs?.length?{
    sql:"(SELECT count(*) FROM simple_grc_records WHERE module='Risk Assessment' AND id IN (SELECT value FROM json_each(?)))=?",
    values:[JSON.stringify(refs),refs.length]
  }:undefined;
  if(riskGuard){
    const present=await db.prepare("SELECT ("+riskGuard.sql+") ok").bind(...riskGuard.values).first<{ok:number}>();
    if(!present?.ok)throw new KriInputError("KRI_RISKS");
  }
  const guard=joinWorkflowGuards(people.guard,riskGuard);
  const now=old?nextLifecycleStamp(old.updated_at):new Date().toISOString(),id=existingId||"RAP-"+crypto.randomUUID();
  const values=[x.category,x.statement,x.kriName,x.metricUnit,x.direction,x.appetiteTarget,x.warningThreshold,x.breachThreshold,x.owner,x.reviewer,x.frequencyDays,x.validFrom,x.validUntil];
  const claim=old?lifecycleClaim(db,"risk_appetite_statements",
    "category=?,statement=?,kri_name=?,metric_unit=?,direction=?,appetite_target=?,warning_threshold=?,breach_threshold=?,owner=?,reviewer=?,frequency_days=?,valid_from=?,valid_until=?,status='draft',updated_by=?,updated_at=?",
    [...values,actor.email,now],old,guard):db.prepare(`INSERT INTO risk_appetite_statements(id,code,category,statement,kri_name,metric_unit,direction,appetite_target,warning_threshold,breach_threshold,owner,reviewer,frequency_days,valid_from,valid_until,status,created_by,created_at,updated_by,updated_at)
    SELECT ?,${auto?"("+nextKriCodeSql+")":"?"},?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,? WHERE ${guard.sql}`).bind(id,...(auto?[]:[x.code]),...values,actor.email,now,actor.email,now,...guard.values);
  const eventId=crypto.randomUUID(),dependents=[lifecycleInsert(db,"risk_appetite_events",{id:eventId,appetite_id:id,action:old?"appetite-update":"appetite-create",detail:refs===undefined?x.code:JSON.stringify({riskRefs:refs}),actor:actor.email,created_at:now})];
  const committed="EXISTS (SELECT 1 FROM risk_appetite_events WHERE id=?)";
  if(!old&&(auto||/^KRI-[0-9]{3,}$/.test(x.code))){
    dependents.push(db.prepare(`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) SELECT id,?,code,? FROM risk_appetite_statements WHERE id=? AND ${committed}`).bind(moduleName,now,id,eventId));
    dependents.push(db.prepare(`INSERT INTO simple_grc_record_code_counters(module,value,updated_at) SELECT ?,CAST(substr(code,5) AS INTEGER),? FROM risk_appetite_statements WHERE id=? AND ${committed} ON CONFLICT(module) DO UPDATE SET value=max(value,excluded.value),updated_at=excluded.updated_at`).bind(moduleName,now,id,eventId));
  }
  if(refs!==undefined){
    dependents.push(db.prepare(`DELETE FROM risk_appetite_risk_links WHERE appetite_id=? AND ${committed}`).bind(id,eventId));
    dependents.push(db.prepare(`INSERT INTO risk_appetite_risk_links(appetite_id,risk_id) SELECT ?,value FROM json_each(?) WHERE ${committed}`).bind(id,JSON.stringify(refs),eventId));
  }
  await commitLifecycle(db,claim,dependents);
  return {id,code:(await db.prepare("SELECT code FROM risk_appetite_statements WHERE id=?").bind(id).first<{code:string}>())!.code};
}

export const riskChoiceColumns="r.id, c.code, json_extract(r.data_json,'$.title') title";
export const riskSource=" FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Risk Assessment' ";
export async function riskChoices(db:D1Database,search:string){
  const result=await db.prepare("SELECT "+riskChoiceColumns+ riskSource+" AND instr(lower(coalesce(c.code,'')||' '||coalesce(json_extract(r.data_json,'$.title'),'')||' '||r.id),lower(?))>0 ORDER BY title,r.id LIMIT 51").bind(search.trim().slice(0,180)).all();
  return {risks:result.results.slice(0,50),more:result.results.length>50};
}
// Do not average unrelated KRI units. A current adverse signal takes precedence over missing indicators.
export const riskAppetiteSql=`(SELECT CASE min(CASE
  WHEN EXISTS (SELECT 1 FROM risk_kri_breaches b WHERE b.appetite_id=a.id AND b.status!='closed') THEN 0
  WHEN a.next_measurement IS NULL OR a.next_measurement<date('now') THEN 1
  ELSE CASE (SELECT m.band FROM risk_kri_measurements m WHERE m.appetite_id=a.id ORDER BY m.period_end DESC LIMIT 1)
    WHEN 'red' THEN 0 WHEN 'amber' THEN 0 WHEN 'green' THEN 2 ELSE 1 END END)
  WHEN 0 THEN 'outside' WHEN 2 THEN 'inside' END
  FROM risk_appetite_risk_links l JOIN risk_appetite_statements a ON a.id=l.appetite_id
  WHERE l.risk_id=r.id AND a.status='approved' AND date('now') BETWEEN a.valid_from AND a.valid_until)`;
