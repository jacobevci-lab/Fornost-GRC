import {CoreReferenceUnavailable} from '../core-reference-write';
import type {PlannedTarget} from './domain';

export const connectionSchema = [
  `CREATE TABLE IF NOT EXISTS regulatory_source_frameworks (
 source_id TEXT PRIMARY KEY REFERENCES regulatory_intelligence_sources(id) ON DELETE CASCADE,
 framework_names TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS regulatory_preliminary_impacts (
 change_id TEXT NOT NULL REFERENCES regulatory_changes(id) ON DELETE CASCADE,
 target_type TEXT NOT NULL CHECK(target_type IN ('control','policy','risk','process')),
 target_ref TEXT NOT NULL, target_title TEXT NOT NULL,
 PRIMARY KEY(change_id,target_type,target_ref)
)`
];
export const frameworkColumn = "(SELECT framework_names FROM regulatory_source_frameworks WHERE source_id=s.id) AS frameworks";
export const preliminaryColumn = `(SELECT json_group_array(json_object('type',target_type,'id',target_ref,'title',target_title)) FROM regulatory_preliminary_impacts WHERE change_id=c.id) AS preliminary`;

export async function frameworkChoices(db:D1Database) {
  const exists=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='framework_programs'").first();
  if(!exists)return [];
  return (await db.prepare("SELECT name FROM framework_programs ORDER BY name").all<{name:string}>()).results.map(row=>row.name);
}

export async function sourceConnections(db:D1Database,id:string,input:unknown) {
  const unrestricted={sql:'1',values:[] as string[]};
  if(input===undefined)return {guard:unrestricted,writes:[] as D1PreparedStatement[]};
  if(!Array.isArray(input)||input.some(name=>typeof name!=='string'||!name)||input.length>100)throw new Error('Geçersiz çerçeve seçimi. / Invalid framework selection.');
  const names=[...new Set<string>(input)], encoded=JSON.stringify(names);
  if(names.length){
    const enrolled=await frameworkChoices(db);
    if(names.some(name=>!enrolled.includes(name)))throw new CoreReferenceUnavailable();
  }
  const guard=names.length?{sql:'NOT EXISTS(SELECT value FROM json_each(?) EXCEPT SELECT name FROM framework_programs)',values:[encoded]}:unrestricted;
  const write=db.prepare('INSERT INTO regulatory_source_frameworks(source_id,framework_names) SELECT ?,? WHERE changes()=1 ON CONFLICT(source_id) DO UPDATE SET framework_names=excluded.framework_names').bind(id,encoded);
  return {guard,writes:[write]};
}

const modules={control:'Kontroller',risk:'Risk Assessment',process:'BIA'} as const;
export async function prepareTargets(db:D1Database,input:unknown) {
  const guards:string[]=[], values:string[]=[], targets:PlannedTarget[]=[];
  if(input===undefined)return {guard:{sql:'1',values},targets};
  if(!Array.isArray(input)||input.length>80)throw new Error('En fazla 80 etki hedefi seçilebilir. / Select up to 80 impact targets.');
  const groups=new Map<PlannedTarget['type'],Set<string>>();
  for(const item of input){
    if(!item||typeof item!=='object'||!['control','policy','risk','process'].includes(item.type)||typeof item.id!=='string'||!item.id||item.id.length>120)throw new CoreReferenceUnavailable();
    const ids=groups.get(item.type)??new Set<string>();ids.add(item.id);groups.set(item.type,ids);
  }
  for(const [type,ids] of groups){
    const policy=type==='policy';
    if(policy&&!await db.prepare("SELECT 1 FROM sqlite_master WHERE name='policy_documents' AND type='table'").first())throw new CoreReferenceUnavailable();
    const from=policy?'policy_documents r':'simple_grc_records r';
    const scope=policy?"r.status!='retired'":'r.module=?';
    const bindings=type==='policy'?[]:[modules[type]];
    const encoded=JSON.stringify([...ids]);
    const title=policy?'r.title':"COALESCE(json_extract(r.data_json,'$.controlTitle'),json_extract(r.data_json,'$.title'),json_extract(r.data_json,'$.process'),json_extract(r.data_json,'$.riskTitle'),r.id)";
    const sql=`SELECT r.id,${policy?'COALESCE(code.code,r.code)':'code.code'} code,${title} title FROM ${from} LEFT JOIN simple_grc_record_codes code ON code.record_id=r.id WHERE ${scope} AND r.id IN (SELECT value FROM json_each(?))`;
    const rows=(await db.prepare(sql).bind(...bindings,encoded).all<{id:string;code:string|null;title:string}>()).results;
    if(rows.length!==ids.size)throw new CoreReferenceUnavailable();
    for(const row of rows)targets.push({type,id:row.id,title:[row.code,row.title].filter(Boolean).join(' · ')});
    guards.push(`NOT EXISTS(SELECT value FROM json_each(?) EXCEPT SELECT r.id FROM ${from} WHERE ${scope})`);
    values.push(encoded,...bindings);
  }
  return {guard:{sql:guards.join(' AND ')||'1',values},targets};
}
