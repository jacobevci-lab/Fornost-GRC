import type {Actor} from '../api/auth/security';
import {canReadModule,canWriteModule,parseModuleAccess} from '../module-access';
import {ensureCoreGrcSchemaCompatibility} from '../api/grc/schema-compat';
import {validate} from '../core-record-validation';
import {insertCoreRecords} from '../core-reference-write';
import {reserveRecordCodes} from '../record-code-store';
import {recordCodePrefixes,type RecordCodeModule} from '../record-codes';
import {commitLifecycle,lifecycleInsert} from '../enterprise-lifecycle-write';
import {prepareWorkflowSelection,joinWorkflowGuards} from '../workflow-selection-store';
import {ensureFindingsSchemaCompatibility} from '../api/findings/schema-compat';
import {validateFinding} from '../findings/domain';
import {insertFinding} from '../findings/intake-store';
import {validatePolicy} from '../policy-lifecycle/domain';
import {ensurePolicyCenter,nextPolicyCode} from '../policy-lifecycle/center-store';
import {validateIncident} from '../incidents/domain';
import {ensureIncidentTables} from '../incidents/tables';
import {insertReferencedEnterpriseRecord} from '../enterprise-reference-intake';
import {auditPeriod,validateAuditTeam} from '../audit-engagement';
import {emptyAuditPlan} from '../audit-plan';
import {register as registerAi} from '../ai/governance-store';
import {blankProfile} from '../ai/governance-domain';
import {intakeFields} from './intake-fields';
import {entityIds,authority,authorityGuard,currentActor} from './access';
import {resolveScope,visibleEntities} from './scope';
import {EnterpriseError,assertInput} from './http';
import {kinds,recordKind,type Kind} from './register';

type Person={id:string;name:string;email:string;role:Actor['role'];policy_json:string|null};
async function permittedPerson(db:D1Database,p:Person,entity:string,moduleName:string){
 const user:Actor={...p,source:'local',moduleAccess:parseModuleAccess(p.policy_json)};
 user.orgScope=await resolveScope(db,user);
 if(user.orgScope.role==='group-ciso'||!canWriteModule(user,moduleName))return false;
 const ids=await entityIds(db,user);return ids===null||ids.includes(entity);
}
export async function intakePeople(db:D1Database,user:Actor,kind:Kind,entity:string){
 const ids=await entityIds(db,user);
 if(!canWriteModule(user,kinds[kind])||ids!==null&&!ids.includes(entity))throw new EnterpriseError(403,'scope');
 const people=(await db.prepare("SELECT u.id,u.name,u.email,u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') ORDER BY u.name,u.id LIMIT 1001").all<Person>()).results;
 if(people.length>1000)throw new EnterpriseError(503,'directory-limit');
 const result=[];for(const p of people)if(await permittedPerson(db,p,entity,kinds[kind]))result.push({id:p.id,name:p.name,email:p.email,reviewer:p.role==='Admin'&&p.id!==user.id});
 return {people:result};
}
const registryKey=(kind:Kind,id:string)=>kind==='finding'?'work:finding:'+id:kind==='audit'?'enterprise:audit:'+id:kind==='incident'?'enterprise:incident:'+id:id;
async function codeFor(db:D1Database,kind:Kind,id:string){const row=await db.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').bind(registryKey(kind,id)).first<{code:string}>();if(!row)throw new EnterpriseError(503,'code');return row.code;}

export async function createScopedRecord(db:D1Database,user:Actor,b:Record<string,unknown>){
 const candidate=b.values as {asset?:unknown}|undefined;
 const initial=await authority(db,user,typeof candidate?.asset==='string'?[candidate.asset]:[]);
 user=await currentActor(db,user);
 const kind=recordKind(b.kind),moduleName=kinds[kind],entity=b.entity,token=b.requestId;
 assertInput(Object.hasOwn(intakeFields,kind)&&typeof entity==='string'&&typeof token==='string'&&/^[a-f0-9-]{36}$/.test(token));
 if(!['Admin','Editor'].includes(user.role)||!canWriteModule(user,moduleName))throw new EnterpriseError(403,'scope');
 const allowed=await entityIds(db,user),entities=await visibleEntities(db,user),target=entities.find(e=>e.id===entity);
 if(!target||allowed!==null&&!allowed.includes(entity))throw new EnterpriseError(403,'scope');
 const values=b.values;assertInput(values&&typeof values==='object'&&!Array.isArray(values));
 const v=values as Record<string,unknown>,keys=new Set([...intakeFields[kind].map(f=>f.key),...(kind==='risk'?['fairLite']:[])]);
 assertInput(Object.keys(v).every(k=>keys.has(k))&&intakeFields[kind].every(f=>typeof v[f.key]==='string'&&String(v[f.key]).trim().length>0&&String(v[f.key]).length<=3000&&(!f.options||f.options.includes(String(v[f.key])))));
 const payload=JSON.stringify({kind,entity,values:v}),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const prior=await db.prepare("SELECT subject FROM org_access_events WHERE id=? AND actor=? AND action='org-record-create'").bind(token,user.email).first<{subject:string}>();
 if(prior){const receipt=JSON.parse(prior.subject);if(receipt.hash!==hash)throw new EnterpriseError(409,'conflict');const mapping=await db.prepare('SELECT org_entity_id FROM org_record_entities WHERE kind=? AND record_id=?').bind(kind,receipt.id).first<{org_entity_id:string}>();if(mapping?.org_entity_id!==entity)throw new EnterpriseError(409,'conflict');return {id:receipt.id,code:await codeFor(db,kind,receipt.id),replayed:true};}
 await ensureCoreGrcSchemaCompatibility(db);
 const modulePrefix=kind==='ai'?'AIS':kind==='finding'?'FND':kind==='incident'?'INC':kind==='policy'?'POL':kind==='audit'?'AUD':recordCodePrefixes[moduleName as RecordCodeModule];
 const id=modulePrefix+'-'+token,now=new Date().toISOString(),guards:{sql:string;values:unknown[]}[]=[];
 let assetCode='';
 if(v.asset){
  if(!canReadModule(user,kinds.asset))throw new EnterpriseError(403,'scope');
  const asset=await db.prepare("SELECT r.id,c.code,coalesce(o.org_entity_id,'root') entity FROM simple_grc_records r JOIN simple_grc_record_codes c ON c.record_id=r.id LEFT JOIN org_record_entities o ON o.kind='asset' AND o.record_id=r.id WHERE r.id=? AND r.module='Varlık Envanteri'").bind(v.asset).first<{id:string;code:string;entity:string}>();
  if(!asset||asset.entity!==entity)throw new EnterpriseError(403,'scope');assetCode=asset.code;
 }
 guards.push(authorityGuard(user,initial));
 // Directory grants are also pinned; revoking an assignee during intake rejects the write.
 for(const field of intakeFields[kind].filter(f=>f.type==='person')){
  const p=await db.prepare("SELECT u.id,u.name,u.email,u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE lower(u.email)=lower(?) AND u.status='Active' AND u.role IN ('Admin','Editor')").bind(v[field.key]).first<Person>();
  const before=p?await authority(db,{...p,source:'local'},[]):null;
  if(!p)throw new EnterpriseError(400,'assignee');
  const person=await currentActor(db,{...p,source:'local'}),personEntities=await entityIds(db,person);
  if(!canWriteModule(person,moduleName)||personEntities!==null&&!personEntities.includes(entity)||field.key==='reviewer'&&(person.role!=='Admin'||person.id===user.id)||field.key==='testOwner'&&person.id===user.id)throw new EnterpriseError(400,'assignee');
  guards.push(authorityGuard(person,before!));
 }
 const guard=joinWorkflowGuards(...guards),mapping=lifecycleInsert(db,'org_record_entities',{kind,record_id:id,org_entity_id:entity,note:'',revision:token});
 const receipt=lifecycleInsert(db,'org_access_events',{id:token,actor:user.email,action:'org-record-create',subject:JSON.stringify({kind,id,entity,hash}),stamp:now});
 const tail=[mapping,receipt],owner=user.email;
 if(['risk','asset','bia','vendor','control'].includes(kind)){
  const data:Record<string,unknown>={...v,owner:user.name||owner,ownerEmail:owner,ownerSource:'directory',businessUnit:target.name};
  delete data.title;delete data.asset;delete data.testOwner;
  if(kind==='risk')Object.assign(data,{title:v.title,asset:assetCode,status:'Değerlendiriliyor'});
  if(kind==='asset')Object.assign(data,{title:v.title,status:'Planlanan'});
  if(kind==='bia')Object.assign(data,{process:v.title,asset:assetCode,status:'Taslak'});
  if(kind==='vendor')Object.assign(data,{title:v.title,status:'İncelemede'});
  if(kind==='control'){
   const tester=await db.prepare("SELECT name,email FROM local_users WHERE lower(email)=lower(?)").bind(v.testOwner).first<{name:string;email:string}>();
   Object.assign(data,{controlTitle:v.title,implementation:'Uygulama Hazırlığında',status:'Taslak',testOwner:tester!.name||tester!.email,testOwnerEmail:tester!.email,testOwnerSource:'directory'});
  }
  const checked=validate(moduleName,data);if('error' in checked)throw new EnterpriseError(400,'fields');
  const [code]=await reserveRecordCodes(db,moduleName as RecordCodeModule,1,now);
  await insertCoreRecords(db,moduleName,[{id,code,data:checked.data}],now,undefined,{guard:{sql:guard.sql,values:guard.values as string[]},after:mapping,tail:[receipt]});
 }else if(kind==='finding'){
  await ensureFindingsSchemaCompatibility(db);
  const selection=await prepareWorkflowSelection({DB:db},user,{...v,owner,assignmentMode:'directory'},{owner:'writer',reviewer:'reviewer'},false,[owner]);
  const finding=validateFinding({...selection.body,sourceType:'manual',sourceRef:'org:'+entity,sourceTitle:'Org · '+target.name,findingType:'improvement'});
  await insertFinding(db,finding,{id,code:'FND-'+crypto.randomUUID(),actor:owner,stamp:now,guard:joinWorkflowGuards(guard,selection.guard),afterCreate:tail});
 }else if(kind==='policy'){
  await ensurePolicyCenter(db);
  const selection=await prepareWorkflowSelection({DB:db},user,{...v,owner,assignmentMode:'directory'},{owner:'writer',reviewer:'reviewer'},false,[owner]);
  const p=validatePolicy({...selection.body,code:'POL-001'}),g=joinWorkflowGuards(guard,selection.guard);
  await commitLifecycle(db,db.prepare(`INSERT INTO policy_documents(id,code,title,category,classification,owner,reviewer,audience,review_frequency_days,status,created_by,created_at,updated_by,updated_at)
   SELECT ?,(${nextPolicyCode}),?,?,?,?,?,?,?,'draft',?,?,?,? WHERE ${g.sql}`).bind(id,p.title,p.category,p.classification,p.owner,p.reviewer,p.audience,p.reviewFrequencyDays,owner,now,owner,now,...g.values),[
   lifecycleInsert(db,'policy_events',{id:crypto.randomUUID(),policy_id:id,action:'policy-create',detail:p.title,actor:owner,created_at:now}),...tail]);
 }else if(kind==='audit'){
  auditPeriod(String(v.periodStart),String(v.periodEnd),String(v.targetDate));validateAuditTeam(owner,String(v.reviewer),true);
  await commitLifecycle(db,db.prepare(`INSERT INTO simple_audits(id,name,template,audit_type,auditor,audit_owner,status,created_at,updated_at) SELECT ?,?,'Özel Denetim','Diğer Denetim',?,?,'Başlanmadı',?,? WHERE ${guard.sql}`).bind(id,v.title,v.reviewer,owner,now,now,...guard.values),[
   lifecycleInsert(db,'simple_grc_metadata',{key:'audit_plan_'+id,value:JSON.stringify({plan:{...emptyAuditPlan,periodStart:v.periodStart,periodEnd:v.periodEnd,targetDate:v.targetDate},revision:token,updatedAt:now,updatedBy:owner}),updated_at:now}),
   lifecycleInsert(db,'simple_grc_metadata',{key:'audit_catalog_'+id,value:JSON.stringify({template:'Özel Denetim',structuredTeam:true,count:0,createdBy:owner,createdAt:now}),updated_at:now}),...tail]);
 }else if(kind==='incident'){
  await ensureIncidentTables(db);
  const selection=await prepareWorkflowSelection({DB:db},user,{...v,owner,assignmentMode:'directory'},{owner:'writer',commander:'writer',reviewer:'reviewer'},false,[owner,String(v.commander)]);
  const x=validateIncident({...selection.body,assetRefs:assetCode,dataClassification:'Internal',personalData:false});
  const code='INC-'+crypto.randomUUID();
  await insertReferencedEnterpriseRecord(db,'enterprise_incidents',{id,code,title:x.title,category:x.category,severity:x.severity,detected_date:x.detectedDate,description:x.description,business_impact:x.businessImpact,owner,commander:x.commander,reviewer:x.reviewer,asset_refs:x.assetRefs,data_classification:x.dataClassification,personal_data:0,status:'declared',declared_by:owner,declared_at:now,updated_by:owner,updated_at:now},[{field:'asset_refs',modules:[kinds.asset]}],[
   lifecycleInsert(db,'enterprise_incident_events',{id:crypto.randomUUID(),incident_id:id,action:'incident-declare',to_status:'declared',detail:x.title,actor:owner,created_at:now}),...tail],joinWorkflowGuards(guard,selection.guard));
 }else if(kind==='ai'){
  await registerAi({DB:db},user,{profile:{...blankProfile,...v,name:v.title,purpose:v.description,unit:target.name,owner,sources:[v.sources],pii:v.sources==='pii',noTraining:false,zdr:false,transfer:false,write:false,asset:[],vendor:[],risks:[],controls:[]}}, {id,guard,tail});
 }
 return {id,code:await codeFor(db,kind,id),replayed:false};
}
