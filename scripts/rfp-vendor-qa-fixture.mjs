// Isolated localhost QA fixtures only. Never apply to production.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const db=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
function seed(table,values){const all={};for(const c of db.prepare(`PRAGMA table_info(${table})`).all())if(c.notnull&&c.dflt_value===null)all[c.name]=c.type==='INTEGER'?1:'fixture';Object.assign(all,values);console.log(`INSERT INTO ${table}(${Object.keys(all)}) VALUES(${Object.values(all).map(quote)});`);}
const now='2026-11-24T00:00:00.000Z',actor='rfp@fornost.test',reviewer='rfp-reviewer@fornost.test';
seed('simple_grc_records',{id:'rfp-vendor',module:'Tedarikçiler',data_json:JSON.stringify({title:'RFP QA Cloud Vendor',service:'Cloud service',owner:actor,criticality:'Kritik',riskLevel:'Orta',status:'Aktif'}),created_at:now,updated_at:now});
seed('simple_grc_record_codes',{record_id:'rfp-vendor',module:'Tedarikçiler',code:'VEN-850',created_at:now});
seed('third_party_profiles',{vendor_id:'rfp-vendor',name:'RFP QA Cloud Vendor',service:'Cloud service',category:'Technology',legal_entity:'IT',criticality:'critical',data_classification:'Internal',data_access:'limited',hosting_location:'EU',business_owner:actor,risk_owner:actor,reviewer,contact:'vendor@example.test',contract_end:'2099-01-01',next_review:'2098-01-01',exit_plan:'Export and remove all data',status:'active',created_by:actor,created_at:now,updated_by:actor,updated_at:now});
for(const status of ['published','draft']){const id='rfp-policy-'+status,content='MFA access is enforced for all privileged production accounts. Access reviews are required and independently approved evidence is retained.';
 seed('policy_documents',{id,code:status==='published'?'POL-850':'POL-851',title:'MFA access policy',category:'security',classification:'Internal',owner:actor,reviewer,audience:'All staff',review_frequency_days:365,status,current_version_id:id+'-v1',next_review:'2099-01-01',created_by:actor,created_at:now,updated_by:actor,updated_at:now});
 seed('policy_versions',{id:id+'-v1',policy_id:id,version_number:1,summary:'QA initial version',content,content_sha256:createHash('sha256').update(content).digest('hex'),status,control_refs_json:'[]',regulation_refs_json:'[]',risk_refs_json:'[]',effective_date:'2020-01-01',approved_by:status==='published'?reviewer:null,approved_at:status==='published'?now:null,created_by:actor,created_at:now,updated_by:actor,updated_at:now});
}
