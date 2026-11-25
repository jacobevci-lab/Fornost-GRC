import {agentActor,authority,authorityGuard} from '../agentic/access';
import {fullAccess} from '../agentic/common';
import type { Actor } from '../../api/auth/security';
import { prepareWorkflowSelection,joinWorkflowGuards } from '../../workflow-selection-store';
import { resolveFindingSource } from '../../findings/source-records';
import { validateFinding } from '../../findings/domain';
import { insertFinding } from '../../findings/intake-store';
import { storedFindingCode } from '../../findings/codes';
import { ensureFindingsSchemaCompatibility } from '../../api/findings/schema-compat';
import { insertCoreRecords } from '../../core-reference-write';
import { validate } from '../../core-record-validation';
import { reserveRecordCodes } from '../../record-code-store';
import { digest,type Runtime } from './router';
import { coreRecord,vendorDocumentContext,vendorAnalysisCurrent } from './store';
import type { VendorItem } from './domain';
export async function convertVendorItem(env:Runtime,actor:Actor,b:Record<string,unknown>){
 actor=await agentActor(env.DB,actor,true);fullAccess(actor,true);
 if(b.confirmation!=='CREATE')throw new Error('AI_CONFIRMATION');
 if(!['finding','control'].includes(String(b.target))||!Number.isInteger(b.item))throw new Error('AI_CONVERSION');
 const analysis=await env.DB.prepare("SELECT * FROM grc_ai_results WHERE id=? AND kind='vendor'").bind(b.id).first<{id:string;subject:string;source_hash:string;result:string}>();if(!analysis)throw new Error('AI_NOT_FOUND');
 const result=JSON.parse(analysis.result),item:VendorItem=result.items[Number(b.item)];if(!item||b.target==='finding'&&item.kind!=='exception'||b.target==='control'&&item.kind!=='cuec')throw new Error('AI_CONVERSION');
 const vendor=await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(analysis.subject).first<{updated_at:string;status:string;data_classification:string}>(),core=await coreRecord(env.DB,analysis.subject,'Tedarikçiler');
 if(!await vendorAnalysisCurrent(env,analysis))throw new Error('AI_STALE');
 const key=await digest(`${analysis.id}:${b.item}:${b.target}`),id=(b.target==='finding'?'FND-':'CTL-')+key.slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
 const existing=await env.DB.prepare('SELECT record_id FROM grc_ai_conversions WHERE id=?').bind(key).first<{record_id:string}>();if(existing)return conversionReceipt(env,existing.record_id,String(b.target),true);
 const now=new Date().toISOString();
 const selection=await prepareWorkflowSelection(env,actor,{...b,assignmentMode:'directory'},b.target==='finding'?{owner:'writer',reviewer:'reviewer'}:{owner:'writer'});
 const nativeSource=await resolveFindingSource(env.DB,'vendor',analysis.subject);
 const auth=authorityGuard(actor,await authority(env.DB,actor,[analysis.subject]));
 const document=result.documentSource?await vendorDocumentContext(env,analysis.subject,result.documentSource.id):null;
 const guard=joinWorkflowGuards(selection.guard,nativeSource.guard,auth,document?{sql:'EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND data_json=? AND updated_at=?)',values:[document.row.id,document.row.data_json,document.row.updated_at]}:undefined,{sql:"NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND (emergency_stop=1 OR agents_enabled=0 OR drafts_enabled=0))",values:[]},{sql:'EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND data_json=? AND updated_at=?)',values:[core.id,core.data_json,core.updated_at]},{sql:'EXISTS(SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND updated_at IS ? AND status IS ? AND data_classification IS ?)',values:[analysis.subject,vendor?.updated_at??null,vendor?.status??null,vendor?.data_classification??null]});
 const link=env.DB.prepare('INSERT INTO grc_ai_conversions SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM '+(b.target==='finding'?'enterprise_findings':'simple_grc_records')+' WHERE id=?)').bind(key,analysis.id,b.item,b.target,id,actor.email,now,id);
 const audit=env.DB.prepare("INSERT INTO ai_activity_logs(id,actor,action,provider,model,context_refs_json,status,latency_ms,detail,created_at) SELECT ?,?,'vendor-convert','rules','',?,'success',0,?,? WHERE EXISTS(SELECT 1 FROM grc_ai_conversions WHERE id=?)").bind(crypto.randomUUID(),actor.email,JSON.stringify([analysis.id,id]),'Vendor assurance (human confirmed): '+b.target,now,key);
 const entity=env.DB.prepare("INSERT INTO org_record_entities(kind,record_id,org_entity_id,note,revision) SELECT ?,?,coalesce((SELECT org_entity_id FROM org_record_entities WHERE kind='vendor' AND record_id=?),'root'),?,? WHERE EXISTS(SELECT 1 FROM grc_ai_conversions WHERE id=?)").bind(b.target,id,analysis.subject,'Vendor assurance (human confirmed)',crypto.randomUUID(),key);
 try{
 if(b.target==='finding'){
  await ensureFindingsSchemaCompatibility(env.DB);
  const finding=validateFinding({...selection.body,sourceType:'vendor',sourceRef:analysis.subject,sourceTitle:nativeSource.title,findingType:item.kind==='cuec'?'control-deficiency':'observation',description:`${item.quote}\nAI report ${analysis.id}; file SHA-256 ${result.fileHash}`});
  await insertFinding(env.DB,finding,{id,code:id,actor:actor.email,stamp:now,guard,afterCreate:[link,audit,entity]});
  return {id,code:await storedFindingCode(env.DB,id)};
 }
 const owner=await env.DB.prepare("SELECT COALESCE(NULLIF(name,''),email) name FROM local_users WHERE lower(email)=? AND status='Active'").bind(selection.body.owner).first<{name:string}>();if(!owner)throw new Error('AI_CONTROL_FIELDS');
 const checked=validate('Kontroller',{controlTitle:b.title,owner:owner.name,ownerEmail:selection.body.owner,ownerSource:'directory',frequency:b.frequency,status:'Taslak',implementation:'Uygulama Hazırlığında',description:item.quote,controlVendorRef:analysis.subject,aiAnalysisRef:analysis.id});
 if(checked.error||!checked.data)throw new Error('AI_CONTROL_FIELDS');
 const code=(await reserveRecordCodes(env.DB,'Kontroller',1,now))[0];
 await insertCoreRecords(env.DB,'Kontroller',[{id,code,data:checked.data}],now,undefined,{guard:{sql:guard.sql,values:guard.values.map(String)},after:link,tail:[audit,entity]});return {id,code};
 }catch(error){const duplicate=await env.DB.prepare('SELECT record_id FROM grc_ai_conversions WHERE id=?').bind(key).first<{record_id:string}>();if(duplicate)return conversionReceipt(env,duplicate.record_id,String(b.target),true);throw error;}
}

async function conversionReceipt(env:Runtime,id:string,target:string,duplicate:boolean){const row=await env.DB.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').bind(target==='finding'?'work:finding:'+id:id).first<{code:string}>();if(!row?.code)throw new Error('AI_FILE_INTEGRITY');return {id,code:row.code,duplicate};}
