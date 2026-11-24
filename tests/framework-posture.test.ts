import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {ISO,SOC,catalogFor} from '../app/framework-posture/catalog';
import {baselineToken,enroll,ensurePosture,indexPrograms,makeBaseline,previewCatalog,programOverview,PostureError,readImpact,readMatrix,saveDecision} from '../app/framework-posture/store';
import {controlCatalog,prepareControlMappings} from '../app/framework-posture/store';
import {insertCoreRecords,CoreReferenceUnavailable,CoreSideEffectConflict} from '../app/core-reference-write';
import {writeCoreRecord} from '../app/core-record-write';
import {validate} from '../app/core-record-validation';
import {controlConnections} from '../app/control-library-model';
import {displayTitle} from '../app/framework-posture/iso-display';
import {implementationIndex,requirementState} from '../app/framework-posture/requirements';
import {appendEvidenceVersion} from '../app/evidence/versioning';
import {canReadPosture,scopedApiAllowed,type AccessSubject} from '../app/module-access';

test('all bundled ISO requirements have an English display title without changing canonical Turkish records',()=>{
  for(const row of catalogFor(ISO)){
    assert.notEqual(displayTitle(ISO,row.ref,row.title,false),row.title,row.ref);
    assert.equal(displayTitle(ISO,row.ref,row.title,true),row.title);
  }
  assert.equal(displayTitle(SOC,'4.1','Customer text',false),'Customer text');
});

async function fixture(){
  const sql=new DatabaseSync(':memory:');
  function prepare(query:string,values:SQLInputValue[]=[]){
    const execute=()=>({results:sql.prepare(query).all(...values),meta:{changes:Number(sql.prepare('SELECT changes() AS n').get()!.n)}});
    return {bind:(...binds:SQLInputValue[])=>prepare(query,binds),execute,all:async()=>execute(),run:async()=>execute(),first:async()=>sql.prepare(query).get(...values)};
  }
  const db={prepare,batch:async(statements:ReturnType<typeof prepare>[])=>{
    sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}
  }} as unknown as D1Database;
  sql.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT)');
  const record=(id:string,module:string,data:object)=>sql.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,NULL,NULL)').run(id,module,JSON.stringify(data));
  record('C1','Kontroller',{controlTitle:'Accounts',controlRef:'IAM',frameworks:ISO,implementation:'Uygulanıyor'});
  sql.prepare("INSERT INTO simple_grc_record_codes VALUES('C1','CTL-325')").run();
  await ensurePosture(db);await enroll(db,ISO,'owner');
  return {db,sql,record};
}
test('explicit mappings, unambiguous legacy records and separate SoA decisions',async()=>{
  const {db,record}=await fixture();
  await enroll(db,ISO,'again');await enroll(db,SOC,'owner');
  assert.equal((await indexPrograms(db)).enrolled.length,2);
  assert.equal(catalogFor(ISO).filter(r=>r.annex).length,93);
  assert.equal(catalogFor(ISO).filter(r=>!r.annex).length,30);
  assert.deepEqual(await readImpact(db,'C1'),[]);
  record('legacy','Uyum',{framework:ISO,controlRef:'A.5.1',controlLink:'ctl-325'});
  assert.deepEqual((await readImpact(db,'C1')).map(r=>r.ref),['A.5.1']);
  record('duplicate','Kontroller',{controlRef:'CTL-325'});
  assert.deepEqual(await readImpact(db,'C1'),[]);
  const input={name:ISO,ref:'A.5.1',applicability:'included',reason:'IAM is in scope',revision:'',links:[{id:'C1',coverage:'partial'}]};
  for(const invalid of [{...input,applicability:'required'}, {...input,applicability:'excluded',reason:'  '},{...input,ref:'unknown'}]){
    await assert.rejects(saveDecision(db,invalid,'editor'),PostureError);
  }
  await assert.rejects(saveDecision(db,{...input,links:[{id:'legacy',coverage:'supports'}]},'editor'),PostureError);
  await saveDecision(db,input,'editor');
  await assert.rejects(saveDecision(db,input,'stale-editor'),(e:PostureError)=>e.status===409);
  await saveDecision(db,{...input,name:SOC,ref:'CC1.1',applicability:'required',links:[{id:'C1',coverage:'supports'}]},'editor');
  assert.deepEqual((await readImpact(db,'C1')).map(r=>r.coverage),['partial','supports']);
});
test('capture only current explicitly approved anchored evidence matching control and period',async()=>{
  const {db,sql,record}=await fixture();
  await saveDecision(db,{name:ISO,ref:'A.5.1',applicability:'included',reason:'In scope',revision:'',links:[{id:'C1',coverage:'supports'}]},'owner');
  // Reading a mapped matrix initializes the evidence history schema on old installations.
  await readMatrix(db,ISO);
  for(const [id,status,period,extra] of [
    ['valid','Onaylandı','Q3',{}],['pending','İncelemede','Q3',{}],['expired','Approved','Q3',{expiresAt:'2020-01-01'}],
    ['other','Approved','Q2',{}],['unreviewed','Approved','Q3',{reviewedVersion:null}],['self','Approved','Q3',{owner:'reviewer@example.test'}],['broken','Approved','Q3',{versionChainSha256:'bad'}],['changed','Approved','Q3',{controlRefs:'ELSE'}],
  ] as const){
    const hash='a'.repeat(64);
    const version=await appendEvidenceVersion(db,{evidenceId:id,fileKey:'evidence/'+id+'.pdf',fileName:'sample.pdf',fileType:'application/pdf',fileSize:10,contentSha256:hash,evidenceTitle:id,owner:'owner',period,frameworks:ISO,controlRefs:'IAM',changeNote:'initial',createdBy:'owner',createdAt:'2026-01-01T00:00:00Z'});
    const head=sql.prepare("SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1").get(id);
    record(id,'Kanıtlar',{reviewStatus:'approved',reviewer:'reviewer@example.test',reviewedBy:'reviewer@example.test',reviewedVersion:head?.id,status,period,contentSha256:hash,versionNo:version.versionNo,versionChainSha256:version.chainSha256,controlRef:'IAM',...extra});
  }
  await enroll(db,SOC,'owner');
  await saveDecision(db,{name:SOC,ref:'CC1.1',applicability:'required',links:[{id:'C1',coverage:'partial'}],revision:''},'owner');
  await saveDecision(db,{name:ISO,ref:'A.5.2',applicability:'excluded',reason:'Outside scope',links:[{id:'C1',coverage:'supports'}],revision:''},'owner');
  const summary=await programOverview(db);
  assert.deepEqual(summary.coverage[ISO],{scope:122,compliant:1,evidenced:1,assessed:1});
  assert.deepEqual(summary.coverage[SOC],{scope:catalogFor(SOC).length,compliant:0,evidenced:1,assessed:1});
  assert.equal(summary.comparison[ISO].items.length,3);
  assert.equal(summary.comparison[SOC].items[0].state,'partial');
  assert.equal(summary.comparison[SOC].items[0].controlCode,'CTL-325');
  assert.equal(summary.comparison[SOC].openCount,catalogFor(SOC).length);
  const preview=previewCatalog(ISO);
  assert.equal(preview.requirements.length,123);
  assert.deepEqual(preview.pins,{});
  assert.ok(preview.requirements.every(row=>!row.links.length));
  const matrix=await readMatrix(db,ISO), captured=makeBaseline(matrix,'Q3'), token=await baselineToken(captured);
  const implementations=implementationIndex(matrix.controls);
  implementations.set('other','implemented');
  assert.equal(summary.controlFrameworkCounts.C1,2);
  const annex=matrix.requirements.find(row=>row.ref==='A.5.1')!;
  assert.equal(requirementState(annex,matrix.pins,implementations),'covered');
  assert.equal(requirementState({...annex,applicability:'undecided'},matrix.pins,implementations),'decision');
  assert.equal(requirementState({...annex,links:[{id:'C1',coverage:'partial'}]},matrix.pins,implementations),'partial');
  assert.equal(requirementState({...annex,links:[{id:'C1',coverage:'partial'},{id:'other',coverage:'supports'}]},matrix.pins,implementations),'evidence');
  for(const missing of ['','Uygulama Hazırlığında','Uygulanmıyor']){
    assert.equal(requirementState(annex,matrix.pins,new Map([['C1',missing.toLowerCase()]])),'implementation');
  }
  assert.equal(requirementState(annex,matrix.pins,new Map([['C1','kısmi']])),'partial');
  assert.equal(requirementState(annex,{},implementations),'evidence');
  const soc=(await readMatrix(db,SOC)).requirements[0];
  await assert.rejects(saveDecision(db,{name:SOC,...soc,applicability:'excluded',reason:'  '},'owner'),PostureError);
  await saveDecision(db,{name:SOC,...soc,applicability:'excluded',reason:'Local service boundary'},'owner');
  const dropped=await programOverview(db);
  assert.equal(dropped.controlFrameworkCounts.C1,1);
  assert.equal(dropped.coverage[SOC].scope,catalogFor(SOC).length-1);
  const linked=(await readMatrix(db,SOC)).requirements.find(row=>row.ref==='CC1.1')!;
  await saveDecision(db,{name:SOC,ref:'CC1.1',applicability:'required',revision:linked.revision,links:[{id:'C1',coverage:'supports'}]},'owner');
  const shared=await programOverview(db);assert.equal(shared.coverage[ISO].compliant,1);assert.equal(shared.coverage[SOC].compliant,1);
  assert.equal(captured.total,123);assert.equal(captured.withEvidence,1);
  assert.deepEqual(Object.values(captured.evidence).map(p=>p.evidenceId),['valid']);
  sql.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','Reddedildi') WHERE id='valid'").run();
  assert.equal(makeBaseline(await readMatrix(db,ISO),'Q3').withEvidence,0);
  assert.equal(await baselineToken(captured),token);
});
test('cross-module scope and viewer boundaries',()=>{
  const viewer:AccessSubject={role:'Viewer',moduleAccess:{mode:'scoped',modules:{Uyum:'read',Kontroller:'read','Kanıtlar':'read'}}};
  assert.equal(canReadPosture(viewer),true);assert.equal(scopedApiAllowed(viewer,'/api/framework-posture','POST'),false);
  assert.equal(scopedApiAllowed({role:'Editor',moduleAccess:{mode:'scoped',modules:{Uyum:'write'}}},'/api/framework-posture','GET'),false);
});

test('control library saves cross-framework mappings atomically and retains coverage, SoA and concurrent decisions',async()=>{
  const {db,sql}=await fixture();
  sql.exec('ALTER TABLE simple_grc_record_codes ADD COLUMN module TEXT; ALTER TABLE simple_grc_record_codes ADD COLUMN created_at TEXT');
  const iso={name:ISO,ref:'A.5.15'},soc={name:SOC,ref:'CC6.1'};
  await assert.rejects(prepareControlMappings(db,'C2',[{...soc,linked:true,revision:''}],'admin'),PostureError);
  await enroll(db,SOC,'admin');
  await saveDecision(db,{...iso,applicability:'included',reason:'Access governance',links:[{id:'C1',coverage:'partial'}],revision:''},'reviewer');
  const catalog=await controlCatalog(db,'C2');
  const revision=catalog.programs.find(p=>p.name===ISO)!.clauses.find(c=>c.ref===iso.ref)!.revision;
  const changes=[{...iso,linked:true,revision},{...soc,linked:true,revision:''}];
  const side=await prepareControlMappings(db,'C2',changes,'admin');
  const data={controlTitle:'Access monitoring',owner:'Ops',frequency:'Monthly',implementation:'Kısmi',status:'Taslak'};
  const initial='2026-01-01T00:00:00.000Z';
  await insertCoreRecords(db,'Kontroller',[{id:'C2',code:'CTL-326',data}],initial,undefined,side);
  const row=(await readMatrix(db,ISO)).requirements.find(r=>r.ref===iso.ref)!;
  assert.equal(row.reason,'Access governance');assert.equal(row.applicability,'included');
  assert.deepEqual(row.links,[{id:'C1',coverage:'partial'},{id:'C2',coverage:'supports'}]);
  assert.deepEqual((await readImpact(db,'C2')).map(c=>c.ref).sort(),['A.5.15','CC6.1']);
  const removeChange={...iso,linked:false,revision:row.revision};
  const removal=await prepareControlMappings(db,'C2',[removeChange],'admin');
  const snapshot={module:'Kontroller',data_json:JSON.stringify(data),updated_at:initial};
  await assert.rejects(writeCoreRecord(db,'C2',snapshot,{...data,supportingEvidenceRefs:['RSK-001']},initial,removal),CoreReferenceUnavailable);
  assert.equal((await readImpact(db,'C2')).length,2);
  await saveDecision(db,{...iso,revision:row.revision,links:row.links,applicability:'included',reason:'Concurrent review'},'reviewer');
  await assert.rejects(writeCoreRecord(db,'C2',snapshot,{...data,controlTitle:'Stale title'},initial,removal),CoreSideEffectConflict);
  assert.equal(sql.prepare("SELECT data_json FROM simple_grc_records WHERE id='C2'").get()!.data_json,snapshot.data_json);
  const next=(await readMatrix(db,ISO)).requirements.find(r=>r.ref===iso.ref)!;
  await writeCoreRecord(db,'C2',snapshot,data,initial,await prepareControlMappings(db,'C2',[{...removeChange,revision:next.revision}],'admin'));
  assert.deepEqual((await readImpact(db,'C2')).map(r=>r.ref),[soc.ref]);
  assert.equal((await readMatrix(db,ISO)).requirements.find(r=>r.ref===iso.ref)!.reason,'Concurrent review');
});
test('control form accepts optional internal refs, enforces independent testers and counts each related record once',()=>{
  const base={controlTitle:'Review',owner:'Ops',frequency:'Aylık',implementation:'Kısmi',status:'Taslak'};
  assert.ok(validate('Kontroller',base).data);
  assert.ok(validate('Kontroller',{...base,testOwner:'OPS'}).error);
  assert.ok(validate('Kontroller',{...base,controlType:'free text'}).error);
  assert.equal(validate('Kontroller',{...base,controlType:'Tespit Edici'}).data?.controlType,'detective');
  const control={id:'C1',module:'Kontroller',code:'CTL-325',data:{...base,controlRiskRefs:['R1'],supportingEvidenceRefs:['E1']}};
  const risk={id:'R1',module:'Risk Assessment',code:'RSK-009',data:{existingControls:'CTL-325'}};
  const evidence={id:'E1',module:'Kanıtlar',code:'EVD-011',data:{controlRefs:['CTL-325'],controlRef:'CTL-325'}};
  const links=controlConnections([control,risk,evidence]).get('C1')!;
  assert.deepEqual([...links.risks.keys()],['R1']);assert.deepEqual([...links.evidence.keys()],['E1']);assert.equal(links.incoming.size,2);
});
