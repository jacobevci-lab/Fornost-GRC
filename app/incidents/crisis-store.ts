import type {Actor} from '../api/auth/security';
import {commitLifecycle,lifecycleClaim,lifecycleInsert,nextLifecycleStamp,LifecycleConflict} from '../enterprise-lifecycle-write';
import {prepareWorkflowSelection,workflowPinStatement,joinWorkflowGuards} from '../workflow-selection-store';
import {ensureFindingsSchemaCompatibility} from '../api/findings/schema-compat';
import {ensureCoreGrcSchemaCompatibility} from '../api/grc/schema-compat';
import {insertFinding} from '../findings/intake-store';
import {addDays,findingSlaDays,validateFinding} from '../findings/domain';
import {connectedTitle} from '../connected-grc-model';
import {instant,type CrisisTarget} from './crisis';
import {IncidentDecisionError} from './decision-store';
type Row=Record<string,string|number|null>;
type Env={DB:D1Database;BUCKET?:R2Bucket};
const refs=(v:unknown)=>[...new Set(String(v||'').split(/[,;|\n]+/).map(v=>v.trim()).filter(Boolean))];
const projectedId=(id:string)=>'FND-remediation-'+id;
export function declarationDetails(input:Record<string,unknown>){
 const detected=input.detectedAt==null?null:instant(input.detectedAt);
 const vendor=input.vendorRef||null;
 if(vendor!==null&&(typeof vendor!=='string'||vendor.length>120))throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
 return {detected_at:detected,vendor_ref:vendor as string|null};
}
export function incidentEntityGuard(input:Record<string,unknown>){
 const chosen=input.referenceMode==='record-id';
 if(input.referenceMode!==undefined&&!chosen)throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
 const selections=[...(chosen?[...refs(input.assetRefs).map(id=>[id,'Varlık Envanteri']),...(input.riskRef?[[input.riskRef,'Risk Assessment']]:[]),...(input.biaRef?[[input.biaRef,'BIA']]:[])]:[]),...(input.vendorRef?[[input.vendorRef,'Tedarikçiler']]:[])];
 if(chosen&&(!refs(input.assetRefs).length||String(input.assetRefs).length>1000)||selections.length>30)throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
 return selections.length?{sql:'NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM simple_grc_records r WHERE r.id=json_extract(s.value,\'$[0]\') AND r.module=json_extract(s.value,\'$[1]\')))',values:[JSON.stringify(selections)]}:undefined;
}
async function record(db:D1Database,id:unknown){
 if(typeof id!=='string'||!/^INC-[\w-]{1,100}$/.test(id))throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
 const r=await db.prepare('SELECT * FROM enterprise_incidents WHERE id=?').bind(id).first<Row>();
 if(!r)throw new IncidentDecisionError('INCIDENT_SOURCE_MISSING',404);return r;
}
export async function readCrisisDetails(db:D1Database,id:unknown){
 const r=await record(db,id);
 await ensureCoreGrcSchemaCompatibility(db);await ensureFindingsSchemaCompatibility(db);
 const assetIds=refs(r.asset_refs),keys=JSON.stringify([...assetIds,...refs(r.bia_ref)]);
 const select="SELECT r.id,r.module,r.data_json,COALESCE(c.code,r.id) code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id";
 type Target={id:string;module:string;data_json:string;code:string};
 const direct=await db.prepare(select+" WHERE r.module IN ('BIA','Varlık Envanteri') AND (r.id IN (SELECT value FROM json_each(?)) OR c.code IN (SELECT value FROM json_each(?)))").bind(keys,keys).all<Target>();
 const assets=direct.results.filter(t=>t.module==='Varlık Envanteri'&&(assetIds.includes(t.id)||assetIds.includes(t.code)));
 const aliases=JSON.stringify(assets.flatMap(t=>[t.id,t.code]));
 const assetData="json_extract(r.data_json,'$.asset')";
 const assetList=`CASE WHEN json_type(r.data_json,'$.asset')='array' THEN ${assetData} ELSE json_array(${assetData}) END`;
 const related=await db.prepare(select+` WHERE r.module='BIA' AND json_valid(r.data_json) AND EXISTS(SELECT 1 FROM json_each(${assetList}) a JOIN json_each(?) t ON instr('|'||replace(replace(replace(replace(a.value,',','|'),';','|'),char(10),'|'),'| ','|')||'|','|'||t.value||'|')>0)`).bind(aliases).all<Target>();
 const targets:CrisisTarget[]=[...new Map([...assets,...direct.results.filter(t=>t.module==='BIA'&&[t.id,t.code].includes(String(r.bia_ref))),...related.results].map(t=>[t.id,t])).values()].map(t=>{
   const data=JSON.parse(t.data_json);return {id:t.id,module:t.module,code:t.code,title:connectedTitle({...t,data}),rto:data.rto??data.rtoHours,mtpd:data.mtpd??data.mtpdHours};
 });
 const people=await db.prepare('SELECT name,email,status FROM local_users WHERE lower(email) IN (SELECT lower(value) FROM json_each(?))').bind(JSON.stringify([r.owner,r.commander,r.reviewer])).all();
 const restored=await db.prepare("SELECT created_at FROM enterprise_incident_events WHERE incident_id=? AND action='recover' ORDER BY created_at DESC,id DESC LIMIT 1").bind(id).first<{created_at:string}>();
 return {targets,people:people.results,restoredAt:['recovered','review','closed'].includes(String(r.status))?restored?.created_at||null:null,finding:await db.prepare('SELECT id,code FROM enterprise_findings WHERE id=?').bind(projectedId(String(id))).first()};
}
export async function crisisAction(env:Env,actor:Actor,body:Record<string,unknown>){
 const r=await record(env.DB,body.incidentId),id=String(r.id),action=String(body.action),stamp=nextLifecycleStamp(r.updated_at);
 const writer=actor.role==='Admin'||[r.owner,r.commander].some(email=>String(email).toLowerCase()===actor.email.toLowerCase());
 if(!writer)throw new IncidentDecisionError('INCIDENT_DECISION_ACCESS',403);
 if(action==='create-improvement'){
   if(!r.root_cause||!['review','closed'].includes(String(r.status)))throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',409);
   await ensureFindingsSchemaCompatibility(env.DB);
   const findingId=projectedId(id);
   const lookup=()=>env.DB.prepare('SELECT id,code FROM enterprise_findings WHERE id=?').bind(findingId).first();
   const existing=await lookup();if(existing)return {finding:existing};
   if(body.expectedUpdatedAt!==r.updated_at)throw new LifecycleConflict();
   const selection=await prepareWorkflowSelection(env,actor,{assignmentMode:'directory',owner:r.owner,reviewer:r.reviewer},{owner:'writer',reviewer:'reviewer'});
   const tr=body.lang!=='en',sourceTitle=String(r.title),root=String(r.root_cause);
   const finding=validateFinding({sourceType:'incident',sourceRef:id,sourceTitle,title:sourceTitle,findingType:'incident-action',description:r.description,rootCause:root,
     correctiveAction:(tr?'Olay kök nedenini gider ve düzeltmeyi doğrula. ':'Remediate the incident root cause and verify the correction. ')+root,
     preventiveAction:r.lessons_learned,severity:r.severity,owner:selection.body.owner,reviewer:selection.body.reviewer,riskRef:r.risk_ref||'',
     dueDate:addDays(stamp.slice(0,10),findingSlaDays(String(r.severity)))});
   const guard=joinWorkflowGuards(selection.guard,{sql:'EXISTS(SELECT 1 FROM enterprise_incidents WHERE id=? AND updated_at=? AND root_cause=?) AND NOT EXISTS(SELECT 1 FROM enterprise_findings WHERE id=?)',values:[id,r.updated_at,r.root_cause,findingId]});
   try{await insertFinding(env.DB,finding,{id:findingId,code:findingId,actor:actor.email,stamp,guard,afterCreate:[lifecycleInsert(env.DB,'enterprise_incident_events',{id:crypto.randomUUID(),incident_id:id,action,from_status:r.status,to_status:r.status,detail:sourceTitle,actor:actor.email,created_at:stamp})]});}
   catch(error){const prior=await lookup();if(prior)return {finding:prior};throw error;}
   return {finding:await lookup()};
 }
 if(['closed','cancelled'].includes(String(r.status))||body.expectedUpdatedAt!==r.updated_at)throw new LifecycleConflict();
 const eventId=crypto.randomUUID(),base={id:eventId,incident_id:id,action,from_status:r.status,to_status:r.status,actor:actor.email,created_at:stamp};
 if(action==='link-evidence'){
   if(body.evidenceMode!=='library')throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',422);
   const selected=await prepareWorkflowSelection(env,actor,body,{},true);
   const ev=selected.evidence!;
   const duplicate={sql:"NOT EXISTS(SELECT 1 FROM workflow_evidence_pins WHERE workflow='incidents' AND entity_id=? AND purpose='incident-response' AND json_extract(snapshot_json,'$.id')=?)",values:[id,ev.id]};
   await commitLifecycle(env.DB,lifecycleClaim(env.DB,'enterprise_incidents','updated_by=?,updated_at=?',[actor.email,stamp],r,joinWorkflowGuards(selected.guard,duplicate)),[
     lifecycleInsert(env.DB,'enterprise_incident_events',{...base,detail:ev.evidenceTitle,evidence_reference:ev.evidenceId,evidence_sha256:ev.contentSha256}),
     ...workflowPinStatement(env.DB,selected,'incidents',id,'incident-response',eventId,actor.email)]);
   return {linked:true};
 }
 if(action!=='record-notification')throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',400);
 const decision=String(body.decision),scope=String(body.scope),regime=String(body.regime),reason=String(body.rationale||'').trim();
 if(!['required','not-required'].includes(decision)||!['authority','individuals','both'].includes(scope)||!['kvkk','gdpr','both'].includes(regime)||reason.length<20||reason.length>2000)throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',422);
 const prior=await env.DB.prepare('SELECT * FROM incident_crisis_context WHERE incident_id=?').bind(id).first<Row>();
 const awareness=body.awarenessAt?instant(body.awarenessAt):prior?.awareness_at||null;
 if(prior?.awareness_at&&awareness!==prior.awareness_at)throw new IncidentDecisionError('INCIDENT_DECISION_INPUT',422);
 await commitLifecycle(env.DB,lifecycleClaim(env.DB,'enterprise_incidents','notification_decision=?,notification_rationale=?,updated_by=?,updated_at=?',[decision,reason,actor.email,stamp],r),[
   lifecycleInsert(env.DB,'enterprise_incident_events',{...base,detail:JSON.stringify({decision,scope,regime,rationale:reason,awarenessAt:awareness})}),
   env.DB.prepare('INSERT INTO incident_crisis_context(incident_id,awareness_at,notification_regime,notification_scope) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(incident_id) DO UPDATE SET awareness_at=excluded.awareness_at,notification_regime=excluded.notification_regime,notification_scope=excluded.notification_scope').bind(id,awareness,regime,scope)
 ]);
 return {saved:true};
}
