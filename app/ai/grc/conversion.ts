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
import { coreRecord } from './store';
import type { VendorItem } from './domain';
export async function convertVendorItem(env:Runtime,actor:Actor,b:Record<string,unknown>){
 if(!['finding','control'].includes(String(b.target))||!Number.isInteger(b.item))throw new Error('AI_CONVERSION');
 const analysis=await env.DB.prepare("SELECT * FROM grc_ai_results WHERE id=? AND kind='vendor'").bind(b.id).first<{id:string;subject:string;source_hash:string;result:string}>();if(!analysis)throw new Error('AI_NOT_FOUND');
 const result=JSON.parse(analysis.result),item:VendorItem=result.items[Number(b.item)];if(!item)throw new Error('AI_CONVERSION');
 const vendor=await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(analysis.subject).first<{updated_at:string;status:string;data_classification:string}>(),core=await coreRecord(env.DB,analysis.subject,'Tedarikçiler');
 if(analysis.source_hash!==await digest(JSON.stringify(vendor)+core.data_json+core.updated_at))throw new Error('AI_STALE');
 const key=await digest(`${analysis.id}:${b.item}:${b.target}`),id=(b.target==='finding'?'FND-':'CTL-')+key.slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
 const existing=await env.DB.prepare('SELECT record_id FROM grc_ai_conversions WHERE id=?').bind(key).first<{record_id:string}>();if(existing)return {id:existing.record_id,duplicate:true};
 const now=new Date().toISOString();
 const selection=await prepareWorkflowSelection(env,actor,{...b,assignmentMode:'directory'},b.target==='finding'?{owner:'writer',reviewer:'reviewer'}:{owner:'writer'});
 const nativeSource=await resolveFindingSource(env.DB,'vendor',analysis.subject);
 const guard=joinWorkflowGuards(selection.guard,nativeSource.guard,{sql:'EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND data_json=? AND updated_at=?)',values:[core.id,core.data_json,core.updated_at]},{sql:'EXISTS(SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND updated_at IS ? AND status IS ? AND data_classification IS ?)',values:[analysis.subject,vendor?.updated_at??null,vendor?.status??null,vendor?.data_classification??null]});
 const link=env.DB.prepare('INSERT INTO grc_ai_conversions SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM '+(b.target==='finding'?'enterprise_findings':'simple_grc_records')+' WHERE id=?)').bind(key,analysis.id,b.item,b.target,id,actor.email,now,id);
 try{
 if(b.target==='finding'){
  await ensureFindingsSchemaCompatibility(env.DB);
  const finding=validateFinding({...selection.body,sourceType:'vendor',sourceRef:analysis.subject,sourceTitle:nativeSource.title,findingType:item.kind==='cuec'?'control-deficiency':'observation',description:`${item.quote}\nAI report ${analysis.id}; file SHA-256 ${result.fileHash}`});
  await insertFinding(env.DB,finding,{id,code:id,actor:actor.email,stamp:now,guard,afterCreate:[link]});
  return {id,code:await storedFindingCode(env.DB,id)};
 }
 const owner=await env.DB.prepare("SELECT COALESCE(NULLIF(name,''),email) name FROM local_users WHERE lower(email)=? AND status='Active'").bind(selection.body.owner).first<{name:string}>();if(!owner)throw new Error('AI_CONTROL_FIELDS');
 const checked=validate('Kontroller',{controlTitle:b.title,owner:owner.name,ownerEmail:selection.body.owner,ownerSource:'directory',frequency:b.frequency,status:'Taslak',implementation:'Uygulama Hazırlığında',description:item.quote,sourceVendorRef:analysis.subject,aiAnalysisRef:analysis.id});
 if(checked.error||!checked.data)throw new Error('AI_CONTROL_FIELDS');
 const code=(await reserveRecordCodes(env.DB,'Kontroller',1,now))[0];
 await insertCoreRecords(env.DB,'Kontroller',[{id,code,data:checked.data}],now,undefined,{guard:{sql:guard.sql,values:guard.values.map(String)},after:link});return {id,code};
 }catch(error){const duplicate=await env.DB.prepare('SELECT record_id FROM grc_ai_conversions WHERE id=?').bind(key).first<{record_id:string}>();if(duplicate)return {id:duplicate.record_id,duplicate:true};throw error;}
}
