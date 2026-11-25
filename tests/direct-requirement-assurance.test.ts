import test from 'node:test';
import type {AssuranceRecord} from '../app/audit-evidence-assurance';
import {attachAuditInheritance} from '../app/audit-readiness-inheritance';
import assert from 'node:assert/strict';
import {fixture,actor} from './helpers/agent-fixture';
import {ISO,SOC} from '../app/framework-posture/catalog';
import {ensurePosture,enroll,readMatrix,saveDecision,programOverview,makeBaseline} from '../app/framework-posture/store';
import {directDocumentCatalog,saveDirectWork,verifyDirectWork} from '../app/framework-posture/direct-store';
import {requirementState,implementationIndex} from '../app/framework-posture/requirements';
import {appendEvidenceVersion,sha256HexBytes} from '../app/evidence/versioning';
import {resolveScope} from '../app/enterprise/scope';
import type {Actor} from '../app/api/auth/security';

const reviewer:Actor={...actor,id:'reviewer',name:'reviewer',email:'reviewer@example.test'};
async function setup(){
 const f=await fixture();await ensurePosture(f.db);await enroll(f.db,ISO,actor.email);
 const row=async(ref='4.1')=>(await readMatrix(f.db,ISO)).requirements.find(r=>r.ref===ref)!;
 const state=async()=>{const m=await readMatrix(f.db,ISO);return requirementState(m.requirements[0],m.pins,implementationIndex(m.controls));};
 const write=async(extra:Record<string,unknown>={},who=actor)=>saveDirectWork(f.db,who,{name:ISO,ref:'4.1',revision:(await row()).direct?.revision||'',implementation:'implemented',evidenceIds:[],policyIds:[],...extra});
 const verify=async(who=reviewer)=>verifyDirectWork(f.db,who,{name:ISO,ref:'4.1',revision:(await row()).direct?.revision||'',note:'Independent review confirms the evidence demonstrates this requirement.'});
 async function evidence(id='ev',extra:Record<string,unknown>={}){
  const hash='a'.repeat(64),createdAt=new Date().toISOString();
  const v=await appendEvidenceVersion(f.db,{evidenceId:id,fileKey:'evidence/'+id+'.txt',fileName:'context.txt',fileType:'text/plain',fileSize:10,contentSha256:hash,evidenceTitle:'Organizational context',owner:actor.email,period:'2026',frameworks:ISO,controlRefs:'',changeNote:'initial',createdBy:actor.email,createdAt});
  const head=f.sql.prepare('SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1').get(id)!;
  f.record(id,'Kanıtlar',{evidenceTitle:'Organizational context',owner:actor.email,reviewer:reviewer.email,reviewedBy:reviewer.email,reviewStatus:'approved',reviewedVersion:head.id,status:'Onaylandı',period:'2026',contentSha256:hash,versionNo:v.versionNo,versionChainSha256:v.chainSha256,controlRefs:'',...extra});
  f.seed('simple_grc_record_codes',{record_id:id,module:'Kanıtlar',code:'EVD-901',created_at:createdAt});return id;
 }
 async function policy(id='policy',status='published'){
  const content='Organizational context and interested parties are reviewed annually.',hash=await sha256HexBytes(new TextEncoder().encode(content));
  f.seed('policy_documents',{id,code:'POL-950',title:'Context policy',status,current_version_id:id+'-v1',owner:actor.email,reviewer:reviewer.email,created_by:actor.email,next_review:'2099-01-01'});
  f.seed('policy_versions',{id:id+'-v1',policy_id:id,version_number:1,content,content_sha256:hash,status,effective_date:'2020-01-01',created_by:actor.email,submitted_by:actor.email,approved_by:reviewer.email,published_by:reviewer.email});return id;
 }
 return {...f,row,state,write,verify,evidence,policy};
}

test('ISO 4.1: implemented + approved evidence + independent relevance verification, with zero controls, increases live compliance',async()=>{
 const f=await setup();const before=(await programOverview(f.db)).coverage[ISO];assert.equal(before.compliant,0);
 await f.write();assert.equal(await f.state(),'self-declared');assert.equal((await f.row()).links.length,0);
 await assert.rejects(f.verify(),{code:'verification-evidence'});
 await f.evidence();await f.write({evidenceIds:['ev']});assert.equal(await f.state(),'verification');
 await assert.rejects(f.verify(actor),{code:'independent-reviewer'});
 await f.verify();assert.equal(await f.state(),'covered');assert.equal((await f.row()).links.length,0);
 const after=(await programOverview(f.db)).coverage[ISO];assert.equal(after.compliant,1);assert.equal(after.scope,before.scope);assert.ok(after.compliant/after.scope>before.compliant/before.scope);
 const baseline=makeBaseline(await readMatrix(f.db,ISO),'2026');assert.equal(baseline.withEvidence,1);assert.equal(baseline.entries[0].directEvidence?.length,1);assert.equal(baseline.entries[0].controls.length,0);
 f.seed('simple_audits',{id:'audit',name:'Direct evidence audit',template:ISO});f.seed('simple_grc_metadata',{key:'audit_posture_audit',value:JSON.stringify(baseline)});
 const inherited=await attachAuditInheritance<AssuranceRecord & {module:string}>(f.db,[{id:'audit-row',module:'Denetim Yönetimi',data:{auditName:'Direct evidence audit',requirementRef:'4.1'}}]);
 assert.equal(inherited[0].inherited?.pins[0].id,'ev');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM org_access_events WHERE action='requirement-independently-verified'").get()!.n,1);
});
test('published policy can substantiate a requirement without evidence or a control; a draft cannot',async()=>{
 const f=await setup();await f.policy('policy','draft');await f.write({policyIds:['policy']});assert.equal(await f.state(),'self-declared');await assert.rejects(f.verify(),{code:'verification-evidence'});
 f.sql.exec("UPDATE policy_documents SET status='published'; UPDATE policy_versions SET status='published'");
 assert.equal(await f.state(),'verification');await f.verify();assert.equal(await f.state(),'covered');
 f.sql.exec("UPDATE policy_documents SET status='retired'");assert.equal(await f.state(),'self-declared');
});
test('live direct assurance rejects raw status claims, self-approved, expired and tampered evidence',async()=>{
 for(const extra of [{reviewedVersion:'wrong'},{owner:reviewer.email},{expiresAt:'2020-01-01'},{versionChainSha256:'bad'},{reviewStatus:'pending-review'},{contentSha256:'b'.repeat(64)}]){
  const f=await setup();await f.evidence('ev',extra);await f.write({evidenceIds:['ev']});assert.equal(await f.state(),'self-declared',JSON.stringify(extra));await assert.rejects(f.verify(),{code:'verification-evidence'});
 }
});
test('source updates, deleted sources and implementation/link changes invalidate prior verification',async()=>{
 const f=await setup();await f.evidence();await f.write({evidenceIds:['ev']});await f.verify();
 f.sql.exec("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.evidenceTitle','Revised evidence') WHERE id='ev'");assert.equal(await f.state(),'verification');
 await f.verify();await f.write({implementation:'partial',evidenceIds:['ev']});assert.equal(await f.state(),'partial');
 await f.write({evidenceIds:['ev']});assert.equal(await f.state(),'verification');await f.verify();
 f.sql.exec("DELETE FROM simple_grc_records WHERE id='ev'");assert.equal(await f.state(),'self-declared');
});
test('fresh source version and published policy content changes require review again',async()=>{
 const f=await setup();await f.policy();await f.write({policyIds:['policy']});await f.verify();
 f.sql.exec("UPDATE policy_versions SET content='tampered'");assert.equal(await f.state(),'self-declared');
});
test('CAS rejects stale edits, unknown sources, duplicate ids and wrong module ids without partial writes',async()=>{
 const f=await setup();await f.write({implementation:'planned'});assert.equal(await f.state(),'planned');const prior=(await f.row()).direct!;
 await assert.rejects(f.write({revision:''}),{code:'conflict'});
 await assert.rejects(f.write({evidenceIds:['asset']}),{code:'source'});
 await assert.rejects(f.write({evidenceIds:['ev','ev']}),{code:'fields'});
 assert.equal((await f.row()).direct?.revision,prior.revision);
});
test('SoD includes every contributor even after another person changes the requirement',async()=>{
 const f=await setup();await f.evidence();await f.write({evidenceIds:['ev']});await f.write({evidenceIds:['ev']},reviewer);
 await assert.rejects(f.verify(),{code:'independent-reviewer'});await assert.rejects(f.verify(actor),{code:'independent-reviewer'});
});
test('viewer, module-denied and entity-restricted writers cannot mutate direct requirement assurance',async()=>{
 const f=await setup();f.sql.exec("UPDATE local_users SET role='Viewer' WHERE id='admin'");await assert.rejects(f.write(),{code:'forbidden'});
 f.sql.exec("UPDATE local_users SET role='Editor' WHERE id='admin'");f.seed('user_module_access',{user_id:'admin',policy_json:JSON.stringify({mode:'scoped',modules:{Uyum:'read',Kanıtlar:'read'}})});
 await assert.rejects(f.write(),{code:'forbidden'});
 f.sql.exec("DELETE FROM user_module_access; UPDATE local_users SET role='Admin' WHERE id='admin'");
 await assert.rejects(f.write({}, {...actor,orgScope:await resolveScope(f.db,actor,'root')}),{code:'forbidden'});
});
test('scope and policy module filtering do not leak direct ids or establish assurance from hidden documents',async()=>{
 const f=await setup();await f.policy();await f.write({policyIds:['policy']});await f.verify();
 const hidden=await readMatrix(f.db,ISO,null,false);assert.deepEqual(hidden.requirements[0].direct?.policyIds,[]);assert.equal(hidden.requirements[0].direct?.verified,false);
 assert.equal((await directDocumentCatalog(f.db,false)).documents.length,0);
 f.sql.exec("INSERT INTO org_entities VALUES('sub','root','company','Subsidiary')");
 assert.equal((await readMatrix(f.db,ISO,['sub'])).requirements[0].direct,undefined);
 f.sql.exec("INSERT INTO org_record_entities VALUES('policy','policy','sub','','1')");
 assert.equal((await readMatrix(f.db,ISO,['root'])).requirements[0].direct?.verified,false);
 assert.equal((await directDocumentCatalog(f.db,true,['root'])).documents.length,0);
});
test('ISO mandatory clauses cannot be excluded; valid Annex A exclusions reduce denominator and open count',async()=>{
 const f=await setup();const before=await programOverview(f.db);
 await assert.rejects(saveDecision(f.db,{name:ISO,ref:'4.1',revision:'',applicability:'excluded',reason:'Cannot exclude mandatory clauses',links:[]},actor.email),{code:'decision'});
 await assert.rejects(saveDecision(f.db,{name:ISO,ref:'A.5.1',revision:'',applicability:'excluded',reason:' ',links:[]},actor.email),{code:'decision'});
 await saveDecision(f.db,{name:ISO,ref:'A.5.1',revision:'',applicability:'excluded',reason:'Documented boundary rationale',links:[]},actor.email);
 const after=await programOverview(f.db);assert.equal(after.coverage[ISO].scope,before.coverage[ISO].scope-1);assert.equal(after.comparison[ISO].openCount,before.comparison[ISO].openCount-1);
 f.sql.exec(`INSERT INTO framework_decisions VALUES('${ISO}','4.1','excluded','Legacy invalid exclusion','[]','old','owner','2020')`);
 assert.equal((await f.row()).applicability,'required');assert.equal((await programOverview(f.db)).coverage[ISO].scope,after.coverage[ISO].scope);
 await enroll(f.db,SOC,actor.email);await saveDecision(f.db,{name:SOC,ref:'CC1.1',revision:'',applicability:'excluded',reason:'Documented local boundary',links:[]},actor.email);
});

test('source change or authority revocation during write commits no verification or audit receipt',async()=>{
 for(const mutate of ["UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','Reddedildi') WHERE id='ev'","UPDATE local_users SET status='Disabled' WHERE id='reviewer'"]){
  const f=await setup();await f.evidence();await f.write({evidenceIds:['ev']});
  const revision=(await f.row()).direct!.revision;const batch=f.db.batch.bind(f.db);let injected=false;
  f.db.batch=async (...args:Parameters<typeof batch>)=>{if(!injected){injected=true;f.sql.exec(mutate);}return batch(...args);};
  await assert.rejects(verifyDirectWork(f.db,reviewer,{name:ISO,ref:'4.1',revision,note:'Independent verification with transactional source guards'}),{code:'conflict'});
  assert.equal(f.sql.prepare('SELECT count(*) n FROM framework_requirement_reviews').get()!.n,0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM org_access_events WHERE action='requirement-independently-verified'").get()!.n,0);
 }
});

test('canonical policy codes are shown; policy read denial also prevents guessed direct links',async()=>{
 const f=await setup();await f.policy();const catalog=await directDocumentCatalog(f.db,true);assert.equal(catalog.documents[0].code,'POL-950');
 f.sql.exec("UPDATE local_users SET role='Editor' WHERE id='admin'");
 f.seed('user_module_access',{user_id:'admin',policy_json:JSON.stringify({mode:'scoped',modules:{Uyum:'write',Kanıtlar:'read',Kontroller:'read'}})});
 await assert.rejects(f.write({policyIds:['policy']}),{code:'forbidden'});
});
