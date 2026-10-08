export type AssuranceQueueSearch={query:string;lang:'tr'|'en'};
export function parseAssuranceQueueSearch(query:string,lang:string):AssuranceQueueSearch {
 const value=query.trim();
 if(query.length>200||/\p{Cc}/u.test(query)||!['tr','en'].includes(lang))throw new Error('Invalid assurance search');
 return {query:value,lang:lang as 'tr'|'en'};
}
export function assuranceQueueSearchExpression(lang:'tr'|'en'){
 const decision="CASE WHEN json_valid(w.decision_json) THEN w.decision_json ELSE '{}' END";
 const target=`COALESCE(NULLIF(json_extract(${decision},'$.candidate.payload.controlRef'),''),NULLIF(json_extract(${decision},'$.candidate.lineage.controlRef'),''),NULLIF(json_extract(${decision},'$.targetControlRef'),''),json_extract(${decision},'$.controlRef'),'')`;
 let expression=["w.id","w.finding_id","w.rule_id","f.title","f.owner","r.name","r.control_refs","ef.code",target].map(field=>`COALESCE(${field},'')`).join("||' '||");
 const pairs=lang==='tr'?[['I','ı'],['İ','i'],['Ç','ç'],['Ğ','ğ'],['Ö','ö'],['Ş','ş'],['Ü','ü']]:[['İ','i̇'],['Ç','ç'],['Ğ','ğ'],['Ö','ö'],['Ş','ş'],['Ü','ü']];
 for(const [upper,lower] of pairs)expression=`replace((${expression}),'${upper}','${lower}')`;
 return `lower(${expression})`;
}
