import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {ISO,SOC,catalogFor} from '../app/framework-posture/catalog';
import {baselineToken,enroll,ensurePosture,indexPrograms,makeBaseline,PostureError,readImpact,readMatrix,saveDecision} from '../app/framework-posture/store';
import {appendEvidenceVersion} from '../app/evidence/versioning';
import {canReadPosture,scopedApiAllowed,type AccessSubject} from '../app/module-access';

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
  record('C1','Kontroller',{controlTitle:'Accounts',controlRef:'IAM',frameworks:ISO});
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
  for(const invalid of [{...input,ref:'4.1'}, {...input,reason:''},{...input,ref:'unknown'}]){
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
    ['other','Approved','Q2',{}],['broken','Approved','Q3',{versionChainSha256:'bad'}],['changed','Approved','Q3',{controlRefs:'ELSE'}],
  ] as const){
    const hash='a'.repeat(64);
    const version=await appendEvidenceVersion(db,{evidenceId:id,fileKey:'evidence/'+id+'.pdf',fileName:'sample.pdf',fileType:'application/pdf',fileSize:10,contentSha256:hash,evidenceTitle:id,owner:'owner',period,frameworks:ISO,controlRefs:'IAM',changeNote:'initial',createdBy:'owner',createdAt:'2026-01-01T00:00:00Z'});
    record(id,'Kanıtlar',{status,period,contentSha256:hash,versionNo:version.versionNo,versionChainSha256:version.chainSha256,controlRef:'IAM',...extra});
  }
  const matrix=await readMatrix(db,ISO), captured=makeBaseline(matrix,'Q3'), token=await baselineToken(captured);
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
