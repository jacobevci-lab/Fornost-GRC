import { foldSearch, foldSql } from '../record-search-store';
import { splitContinuousAssuranceControlRefs } from '../continuous-assurance-capa';

// Static projections expose only the identity and title used by intake.
function coreSource(module:string){
  return `SELECT r.id,COALESCE(json_extract(r.data_json,'$.title'),json_extract(r.data_json,'$.controlTitle'),json_extract(r.data_json,'$.process'),r.id) AS title,
    COALESCE(c.code,r.id) AS code,'' AS controls FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id
    WHERE r.module='${module}' AND json_valid(r.data_json)`;
}
const catalogs:Record<string,string> = {
  control:coreSource('Kontroller'),risk:coreSource('Risk Assessment'),
  audit: "SELECT id,name AS title,id AS code,'' AS controls FROM simple_audits",
  'continuous-control': "SELECT f.id,f.title,f.id AS code,r.control_refs AS controls FROM evidence_automation_findings f JOIN evidence_automation_rules r ON r.id=f.rule_id WHERE f.status!='closed'",
  vendor: `SELECT v.vendor_id AS id,v.name AS title,COALESCE(c.code,v.vendor_id) AS code,'' AS controls FROM third_party_profiles v LEFT JOIN simple_grc_record_codes c ON c.record_id=v.vendor_id
    UNION ALL SELECT f.id,f.title,COALESCE(c.code,f.id),'' FROM third_party_findings f LEFT JOIN simple_grc_record_codes c ON c.record_id='work:vendor-finding:'||f.id`,
  incident: "SELECT id,title,code,'' AS controls FROM enterprise_incidents",
  ai: "SELECT id,title,id AS code,'' AS controls FROM ai_findings",
  regulatory: `SELECT r.id,r.title,COALESCE(c.code,r.external_ref) AS code,'' AS controls FROM regulatory_changes r LEFT JOIN simple_grc_record_codes c ON c.record_id='work:regulatory-change:'||r.id`,
  policy: "SELECT id,title,code,'' AS controls FROM policy_documents",
};
export type FindingSourceChoice={id:string;title:string;code:string;controls:string[]};
export class FindingSourceError extends Error { constructor(public status:number){super('FINDING_SOURCE_SELECTION');} }
function catalog(type:unknown){
  if(typeof type!=='string'||!Object.hasOwn(catalogs,type))throw new FindingSourceError(400);
  return catalogs[type];
}
export async function searchFindingSources(db:D1Database,type:unknown,query:string){
  if(query.length>160)throw new FindingSourceError(400);
  const rows=await db.prepare(`SELECT * FROM (${catalog(type)}) WHERE instr(${foldSql("id||' '||title||' '||code")},?)>0 ORDER BY title COLLATE NOCASE,id LIMIT 51`)
    .bind(foldSearch(query.trim())).all<{id:string;title:string;code:string;controls:string}>();
  return {records:rows.results.slice(0,50).map(row=>({...row,controls:splitContinuousAssuranceControlRefs(row.controls)})),more:rows.results.length>50};
}
export async function resolveFindingSource(db:D1Database,type:unknown,id:unknown){
  if(typeof id!=='string'||!id||id.length>120)throw new FindingSourceError(422);
  const sql=catalog(type);
  const rows=await db.prepare(`SELECT title FROM (${sql}) WHERE id=? LIMIT 2`).bind(id).all<{title:string}>();
  if(rows.results.length!==1)throw new FindingSourceError(422);
  const title=rows.results[0].title;
  return {title,guard:{sql:`EXISTS (SELECT 1 FROM (${sql}) WHERE id=? AND title=?)`,values:[id,title]}};
}
