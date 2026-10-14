type Source={table:string;column:string;modules:string[];json?:boolean;filter?:string};
// Server-owned identifiers and predicates only. Historical/closed rows remain references.
const sources:Source[]=[
 {table:'evidence_automation_rules',column:'control_refs',modules:['Kontroller','Uyum']},
 {table:'evidence_automation_runs',column:'evidence_id',modules:['Kanıtlar']},
 {table:'evidence_automation_findings',column:'evidence_id',modules:['Kanıtlar']},
 {table:'evidence_automation_findings',column:'closure_evidence_ref',modules:['Kanıtlar']},
 {table:'continuous_assurance_exceptions',column:'control_ref',modules:['Kontroller','Uyum']},
 {table:'continuous_assurance_exceptions',column:'risk_ref',modules:['Risk Assessment']},
 {table:'continuous_assurance_exceptions',column:'evidence_reference',modules:['Kanıtlar']},
 {table:'enterprise_continuity_plans',column:'bia_ref',modules:['BIA']},
 {table:'enterprise_incidents',column:'asset_refs',modules:['Varlık Envanteri']},
 {table:'enterprise_incidents',column:'risk_ref',modules:['Risk Assessment']},
 {table:'enterprise_incidents',column:'bia_ref',modules:['BIA']},
 {table:'policy_versions',column:'control_refs_json',modules:['Kontroller','Uyum'],json:true},
 {table:'policy_versions',column:'risk_refs_json',modules:['Risk Assessment'],json:true},
 ...['third_party_profiles','third_party_assessments','third_party_findings'].map(table=>({table,column:'vendor_id',modules:['Tedarikçiler']})),
 {table:'enterprise_findings',column:'risk_ref',modules:['Risk Assessment']},
 {table:'enterprise_findings',column:'control_ref',modules:['Kontroller','Uyum']},
 ...Object.entries({audit:['Denetim Yönetimi'],control:['Kontroller','Uyum'],risk:['Risk Assessment'],vendor:['Tedarikçiler']}).map(([type,modules])=>({table:'enterprise_findings',column:'source_ref',modules,filter:`source_type='${type}'`})),
 ...Object.entries({control:['Kontroller','Uyum'],risk:['Risk Assessment'],asset:['Varlık Envanteri'],vendor:['Tedarikçiler'],process:['BIA'],audit:['Denetim Yönetimi'],evidence:['Kanıtlar']}).map(([type,modules])=>({table:'regulatory_change_impacts',column:'target_ref',modules,filter:`target_type='${type}'`})),
];

/** Older on-prem installations may not have initialized each optional module yet. */
export async function enterpriseCoreReferences(db:D1Database,module:string){
 const rules=sources.filter(source=>source.modules.includes(module));
 const names=JSON.stringify([...new Set(rules.map(rule=>rule.table))]);
 const catalogSql="SELECT name FROM sqlite_master WHERE type='table' AND name IN (SELECT value FROM json_each(?))";
 const result=await db.prepare(catalogSql).bind(names).all<{name:string}>();
 const available=new Set(result.results.map(row=>row.name));
 const selects=rules.filter(rule=>available.has(rule.table)).map(rule=>{
  const filter=rule.filter?` WHERE ${rule.filter}`:'';
  return rule.json
   ? `SELECT part.value FROM ${rule.table} JOIN json_each(CASE WHEN json_valid(${rule.column}) AND json_type(${rule.column})='array' THEN ${rule.column} ELSE json_array(${rule.column}) END) part WHERE part.type='text'${rule.filter?` AND ${rule.filter}`:''}`
   : `SELECT ${rule.column} AS value FROM ${rule.table}${filter}`;
 });
 // A module table created between discovery and DELETE must force a fresh decision.
 return{selects,schemaSql:`(SELECT count(*) FROM (${catalogSql}))=?`,schemaValues:[names,available.size]};
}
