// Disposable localhost fixtures. Never apply this file to a production database.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
function seed(table,values){const all={};for(const c of db.prepare(`PRAGMA table_info(${table})`).all())if(c.notnull&&c.dflt_value===null)all[c.name]=c.type==='INTEGER'?1:'fixture';Object.assign(all,values);console.log(`INSERT INTO ${table}(${Object.keys(all)}) VALUES(${Object.values(all).map(quote)});`);}
const now='2026-11-24T00:00:00.000Z',owner='owner@local.test',reviewer='exchange@fornost.test';
seed('org_entities',{id:'portal-entity',parent_id:'root',kind:'subsidiary',name:'Portal subsidiary'});
for(const [id,name,code] of [['portal-qa','Portal QA supplier','VEN-900'],['private-vendor','Private other supplier','VEN-901']]){
 seed('simple_grc_records',{id,module:'Tedarikçiler',data_json:JSON.stringify({title:name,service:'Cloud service',owner,criticality:'Kritik',riskLevel:'Orta',status:'Aktif'}),created_at:now,updated_at:now});
 seed('simple_grc_record_codes',{record_id:id,module:'Tedarikçiler',code,created_at:now});
 seed('third_party_profiles',{vendor_id:id,name,service:'Cloud service',category:'Technology',legal_entity:'IT',criticality:'critical',data_classification:'Internal',data_access:'limited',hosting_location:'EU',business_owner:owner,risk_owner:owner,reviewer,contact:'vendor@supplier.test',contract_end:'2099-01-01',next_review:'2098-01-01',exit_plan:'Export and remove data',status:'onboarding',created_by:owner,created_at:now,updated_by:owner,updated_at:now});
}
seed('org_record_entities',{kind:'vendor',record_id:'portal-qa',org_entity_id:'portal-entity',note:'QA',revision:now});
for(const status of ['published','draft']){
 const id='portal-policy-'+status,content='Security controls are independently reviewed. This is an isolated QA policy.';
 seed('policy_documents',{id,code:status==='published'?'POL-900':'POL-901',title:status==='published'?'Portal published security policy':'Private draft security policy',category:'security',classification:'Internal',owner,reviewer,audience:'All staff',review_frequency_days:365,status,current_version_id:id+'-v1',next_review:'2099-01-01',created_by:owner,created_at:now,updated_by:owner,updated_at:now});
 seed('policy_versions',{id:id+'-v1',policy_id:id,version_number:1,summary:'QA initial version',content,content_sha256:createHash('sha256').update(content).digest('hex'),status,control_refs_json:'[]',regulation_refs_json:'[]',risk_refs_json:'[]',effective_date:'2020-01-01',approved_by:status==='published'?reviewer:null,approved_at:status==='published'?now:null,created_by:owner,created_at:now,updated_by:owner,updated_at:now});
}
seed('simple_grc_records',{id:'portal-control',module:'Kontroller',data_json:JSON.stringify({controlTitle:'Portal identity telemetry',ownerEmail:owner,status:'Taslak',implementation:'Planlandı'}),created_at:now,updated_at:now});
seed('simple_grc_record_codes',{record_id:'portal-control',module:'Kontroller',code:'CTL-900',created_at:now});
seed('risk_appetite_statements',{id:'portal-kri',code:'KRI-900',status:'approved',direction:'upper',kri_name:'Risky sign-in count',valid_from:'2000-01-01',valid_until:'2099-01-01',warning_threshold:1,breach_threshold:2,frequency_days:7,owner,reviewer});
seed('enterprise_findings',{id:'portal-finding',code:'FND-900',title:'Portal remediation',description:'Isolated remediation workflow',status:'open',source_type:'manual',finding_type:'improvement',owner,reviewer,detected_by:'detector@local.test',due_date:'2099-01-01',root_cause:'Missing documented access review',corrective_action:'Implement documented access review',preventive_action:'Schedule periodic independent testing',updated_at:now});
seed('exchange_tickets',{finding_id:'portal-finding',provider:'jira',ticket:'GRC-QA-1',url:'https://jira.example/browse/GRC-QA-1',state:'linked'});
