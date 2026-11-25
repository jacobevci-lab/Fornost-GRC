import {canReadModule,canWriteModule,isScoped,type AccessSubject} from './module-access';
import {contextTypes,contextPairAllowed} from './connected-map-context';
import {ConnectionWriteError,connectedLinkHistorySchema} from './connected-grc-link-store';
import {lifecycleInsert} from './enterprise-lifecycle-write';

const entities:Record<string,[string,string,string?]>={
  audit:['simple_audits','Denetim Yönetimi'],incident:['enterprise_incidents','Güvenlik Olayları'],
  finding:['enterprise_findings','Bulgular ve CAPA'],'finding-manual':['enterprise_findings','Bulgular ve CAPA'],remediation:['enterprise_findings','Bulgular ve CAPA','REMEDIATION:'],
  'continuity-plan':['enterprise_continuity_plans','İş Sürekliliği'],'continuity-exercise':['enterprise_continuity_exercises','İş Sürekliliği'],'continuity-gap':['enterprise_continuity_gaps','İş Sürekliliği'],
  policy:['policy_documents','Politika Merkezi'],'policy-version':['policy_versions','Politika Merkezi'],'policy-exception':['policy_exceptions','Politika Merkezi'],
  'risk-appetite':['risk_appetite_statements','Risk İştahı ve KRI'],'kri-measurement':['risk_kri_measurements','Risk İştahı ve KRI'],'kri-breach':['risk_kri_breaches','Risk İştahı ve KRI'],'risk-scenario':['risk_appetite_scenarios','Risk İştahı ve KRI'],
  'regulatory-source':['regulatory_intelligence_sources','Regülasyon Merkezi'],'regulatory-change':['regulatory_changes','Regülasyon Merkezi'],'regulatory-impact':['regulatory_change_impacts','Regülasyon Merkezi'],
  vendor:['third_party_profiles','Tedarikçiler'],'vendor-assessment':['third_party_assessments','Tedarikçiler'],'vendor-finding':['third_party_findings','Tedarikçiler'],
  'automation-rule':['evidence_automation_rules','Kanıt Otomasyonu'],'automation-assurance':['evidence_automation_rules','Kanıt Otomasyonu','ASSURANCE:'],'automation-source':['evidence_automation_sources','Kanıt Otomasyonu'],'automation-finding':['evidence_automation_findings','Kanıt Otomasyonu'],'automation-remediation':['evidence_automation_findings','Kanıt Otomasyonu','REMEDIATION:'],'automation-run':['evidence_automation_runs','Kanıt Otomasyonu'],
  'ai-model':['ai_model_inventory','AI Yönetişimi'],'ai-alert':['ai_assurance_alerts','AI Yönetişimi'],'ai-finding':['ai_findings','AI Yönetişimi'],
};
export const contextTable='CREATE TABLE IF NOT EXISTS connected_map_context_links(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,source_module TEXT NOT NULL,target_module TEXT NOT NULL,relation TEXT NOT NULL,UNIQUE(source_id,target_id,relation))';
export async function resolveMapRecord(db:D1Database,id:string,actor:AccessSubject){
  const match=/^enterprise:([^:]+):(.+)$/.exec(id);
  if(!match){
    const row=await db.prepare('SELECT module FROM simple_grc_records WHERE id=?').bind(id).first<{module:string}>();
    return row&&canReadModule(actor,row.module)?{module:row.module,sql:'EXISTS(SELECT 1 FROM simple_grc_records WHERE id=?)',key:id}:null;
  }
  const spec=Object.hasOwn(entities,match[1])?entities[match[1]]:null;if(!spec||isScoped(actor)||spec[1]==='AI Yönetişimi'&&actor.role!=='Admin')return null;
  const [table,module,prefix='']=spec;if(!match[2].startsWith(prefix))return null;
  const key=match[2].slice(prefix.length),column=match[1]==='vendor'?'vendor_id':'id';
  return {module,sql:`EXISTS(SELECT 1 FROM ${table} WHERE ${column}=?)`,key};
}
export async function writeContext(db:D1Database,actor:AccessSubject&{email:string},input:Record<string,unknown>){
  const {sourceId,targetId,relation,action,note,edgeId}=input;
  if(typeof sourceId!=='string'||typeof targetId!=='string'||!sourceId||!targetId||sourceId===targetId||Math.max(sourceId.length,targetId.length)>240||typeof relation!=='string'||!Object.hasOwn(contextTypes,relation)||!['link','unlink'].includes(String(action))||typeof note!=='string'||note.trim().length<3||note.length>1000)throw new ConnectionWriteError('invalid');
  const [source,target]=await Promise.all([resolveMapRecord(db,sourceId,actor),resolveMapRecord(db,targetId,actor)]);
  if(!source||!target||!canWriteModule(actor,source.module))throw new ConnectionWriteError('forbidden',403);
  if(!contextPairAllowed(relation,source.module,target.module))throw new ConnectionWriteError('unsupported');
  await db.batch([db.prepare(contextTable),db.prepare(connectedLinkHistorySchema)]);
  const id=crypto.randomUUID(),when=new Date().toISOString();
  const stmt=action==='link'?db.prepare(`INSERT INTO connected_map_context_links SELECT ?,?,?,?,?,? WHERE ${source.sql} AND ${target.sql} ON CONFLICT(source_id,target_id,relation) DO NOTHING`).bind(id,sourceId,targetId,source.module,target.module,relation,source.key,target.key):
    db.prepare('DELETE FROM connected_map_context_links WHERE id=? AND source_id=? AND target_id=? AND relation=?').bind(typeof edgeId==='string'?edgeId:'',sourceId,targetId,relation);
  const results=await db.batch([stmt,lifecycleInsert(db,'connected_grc_link_events',{id:crypto.randomUUID(),source_id:sourceId,target_id:targetId,source_module:source.module,field:'mapContext:'+relation,action:String(action),actor:actor.email,note:note.trim(),before_value:action==='unlink'?targetId:'',after_value:action==='link'?targetId:'',created_at:when})]);
  if(!results[1]?.meta?.changes)throw new ConnectionWriteError('changed',409);
  return {ok:true};
}
