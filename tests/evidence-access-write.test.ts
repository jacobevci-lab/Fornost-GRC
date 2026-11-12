import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import ts from 'typescript';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { canReadEvidenceFile } from '../app/evidence/file-access';
import { evidenceReferenceGuard, evidenceClaimConflict } from '../app/evidence/reference-guard';
import { ensureCoreGrcSchemaCompatibility } from '../app/api/grc/schema-compat';
import { appendEvidenceVersion, ensureEvidenceHistorySchema } from '../app/evidence/versioning';
import { reserveRecordCodes } from '../app/record-code-store';
import { readEvidenceHistoryOverview } from '../app/evidence/history-overview';
import { CoreReferenceUnavailable } from '../app/core-reference-write';
import { LifecycleConflict } from '../app/enterprise-lifecycle-write';

const stamp='2026-11-12T10:00:00.000Z';
async function fixture() {
  const sql=new DatabaseSync(':memory:'); let beforeBatch:(()=>void)|undefined;
  function prepare(query:string,args:SQLInputValue[]=[]) {
    return {bind(...values:SQLInputValue[]){return prepare(query,values)},
      execute(){const results=sql.prepare(query).all(...args);return {results,meta:{changes:Number(sql.prepare('SELECT changes() n').get()!.n)}}},
      async all(){return this.execute()},async run(){return this.execute()},async first(){return sql.prepare(query).get(...args)||null}};
  }
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
  await ensureCoreGrcSchemaCompatibility(db);await ensureEvidenceHistorySchema(db);
  const record=(id:string,module='Kanıtlar',data:object={})=>sql.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,module,JSON.stringify(data),stamp,stamp);
  const control=(id='CTL-001',module='Kontroller')=>record(id,module,{controlTitle:id});
  const input=(id:string,refs:string)=>({evidenceId:id,fileKey:`evidence/${id}/proof.txt`,fileName:'proof.txt',fileType:'text/plain',fileSize:5,contentSha256:'a'.repeat(64),evidenceTitle:id,owner:'QA',period:'2026',frameworks:'',controlRefs:refs,changeNote:'QA upload',createdBy:'qa@example.test',createdAt:stamp});
  // Use the same transactional extension points as the HTTP handlers. The
  // browser regression separately exercises the actual handler wiring.
  async function guardedCreate(id:string,refs:string,code='EVD-100') {
    const guard=evidenceReferenceGuard(id,{controlRefs:refs});
    return appendEvidenceVersion(db,input(id,refs),{
      claim:{statement:c=>db.prepare(`INSERT INTO simple_grc_records SELECT ?,?,?,?,? WHERE ${guard.sql}`).bind(id,'Kanıtlar',JSON.stringify({fileKey:input(id,refs).fileKey,versionNo:c.versionNo}),stamp,stamp,...guard.values),conflict:async()=>new CoreReferenceUnavailable()},
      additionalStatements:c=>[db.prepare('INSERT INTO simple_grc_record_codes SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM evidence_versions WHERE id=?)').bind(id,'Kanıtlar',code,stamp,c.id)],
    });
  }
  const counts=()=>['simple_grc_records','simple_grc_record_codes','evidence_versions','evidence_version_controls'].map(t=>Number(sql.prepare(`SELECT count(*) n FROM ${t}`).get()!.n));
  return {sql,db,record,control,input,guardedCreate,counts,before:(hook:()=>void)=>{beforeBatch=hook}};
}

test('active current, historical and legacy exact keys remain readable',async()=>{
  const f=await fixture();try{
    f.record('EVD-old','Kanıtlar',{fileKey:'evidence/EVD-old/legacy.txt'});
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-old/legacy.txt'),true);
    await f.guardedCreate('EVD-current','ISO A.5.1');
    assert.equal((await readEvidenceHistoryOverview(f.db)).evidenceItems.find(r=>r.id==='EVD-current')?.code,'EVD-100');
    f.sql.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify({fileKey:'evidence/EVD-current/v2.txt'}),'EVD-current');
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-current/proof.txt'),true);
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-current/v2.txt'),true);
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-current/unregistered.txt'),false);
  }finally{f.sql.close()}
});
test('deleted parent revokes current and historical files without deleting retained metadata',async()=>{
  const f=await fixture();try{
    await f.guardedCreate('EVD-delete','A.5.1');
    f.sql.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify({fileKey:'evidence/EVD-delete/v2.txt'}),'EVD-delete');
    f.sql.exec("DELETE FROM simple_grc_records WHERE id='EVD-delete'");
    for(const key of ['proof.txt','v2.txt'])assert.equal(await canReadEvidenceFile(f.db,`evidence/EVD-delete/${key}`),false);
    assert.equal(f.counts()[2],1);assert.equal(f.counts()[3],1);
  }finally{f.sql.close()}
});
test('cross-record copied keys, wrong-module owner and malformed paths never revive an orphan',async()=>{
  const f=await fixture();try{
    await f.guardedCreate('EVD-gone','A.5.1');f.sql.exec("DELETE FROM simple_grc_records WHERE id='EVD-gone'");
    f.record('EVD-other','Kanıtlar',{fileKey:'evidence/EVD-gone/proof.txt'});
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-gone/proof.txt'),false);
    f.record('EVD-gone','Kontroller',{fileKey:'evidence/EVD-gone/proof.txt'});
    assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-gone/proof.txt'),false);
    for(const key of ['evidence/','evidence/EVD-other/../proof.txt','evidence/EVD-other\\x/proof.txt','evidence//proof.txt','evidence/%45VD-gone/proof.txt'])assert.equal(await canReadEvidenceFile(f.db,key),false);
  }finally{f.sql.close()}
});
test('malformed record metadata fails closed but a registered historical key remains supported',async()=>{
  const f=await fixture();try{await f.guardedCreate('EVD-malformed','A.5.1');f.sql.exec("UPDATE simple_grc_records SET data_json='bad json'");assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-malformed/unregistered'),false);assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-malformed/proof.txt'),true)}finally{f.sql.close()}
});
test('canonical control ID/code and compliance reference succeed; free-text standards stay compatible',async()=>{
  for(const ref of ['CTL-001',' ctl-001 ','CTL-001; A.5.1','CMP-001','A.5.1']){const f=await fixture();try{f.control();f.control('CMP-001','Uyum');await f.guardedCreate('EVD-new',ref);assert.deepEqual(f.counts().slice(1,3),[1,1]);assert.equal(await canReadEvidenceFile(f.db,'evidence/EVD-new/proof.txt'),true)}finally{f.sql.close()}}
});
test('missing, wrong-module and mixed invalid references leave no partial record/version/code',async()=>{
  for(const ref of ['CTL-999999999','ctl-999999999','CTL-001, CTL-999999999','AST-001','CTL-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){const f=await fixture();try{f.control();f.control('AST-001','Varlık Envanteri');const before=f.counts();await assert.rejects(f.guardedCreate('EVD-new',ref),CoreReferenceUnavailable);assert.deepEqual(f.counts(),before)}finally{f.sql.close()}}
});
test('target deletion before metadata commit cannot leave an orphan reference',async()=>{
  const f=await fixture();try{f.control();f.before(()=>f.sql.exec("DELETE FROM simple_grc_records WHERE id='CTL-001'"));await assert.rejects(f.guardedCreate('EVD-new','CTL-001'),CoreReferenceUnavailable);assert.deepEqual(f.counts(),[0,0,0,0])}finally{f.sql.close()}
});
test('code collision rolls back source, version and control linkage atomically',async()=>{
  const f=await fixture();try{await f.guardedCreate('EVD-first','A.5.1');const before=f.counts();await assert.rejects(f.guardedCreate('EVD-second','A.5.1'));assert.deepEqual(f.counts(),before)}finally{f.sql.close()}
});
test('failed version claim does not append history or alter the head',async()=>{
  for(const deleted of [false,true]){const f=await fixture();try{
    await f.guardedCreate('EVD-version','A.5.1');const old=String(f.sql.prepare("SELECT data_json FROM simple_grc_records WHERE id='EVD-version'").get()!.data_json);
    if(deleted)f.sql.exec("DELETE FROM simple_grc_records WHERE id='EVD-version'");else f.sql.exec("UPDATE simple_grc_records SET updated_at='concurrent'");
    const guard=evidenceReferenceGuard('EVD-version',{controlRefs:'A.5.1'},{controlRefs:'A.5.1'}),before=f.counts();
    await assert.rejects(appendEvidenceVersion(f.db,f.input('EVD-version','A.5.1'),{claim:{statement:()=>f.db.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=? AND data_json=? AND updated_at=?').bind('{}','EVD-version',old,stamp),conflict:()=>evidenceClaimConflict(f.db,guard)}}),LifecycleConflict);
    assert.deepEqual(f.counts(),before);
  }finally{f.sql.close()}}
});
test('new version rejects new missing refs while preserving unchanged legacy references',async()=>{
  const f=await fixture();try{
    const unchanged=evidenceReferenceGuard('EVD-v',{controlRefs:' ctl-999 '},{controlRef:'CTL-999'});assert.equal(unchanged.sql,'1');
    const guard=evidenceReferenceGuard('EVD-v',{controlRefs:'CTL-999, CTL-998'},{controlRef:'CTL-999'});
    assert.ok(await evidenceClaimConflict(f.db,guard) instanceof CoreReferenceUnavailable);
  }finally{f.sql.close()}
});
test('shared EVD allocator skips legacy IDs, returns unique short codes and never reuses deleted numbers',async()=>{
  const f=await fixture();try{f.record('EVD-031');const a=await reserveRecordCodes(f.db,'Kanıtlar',2,stamp);assert.deepEqual(a,['EVD-032','EVD-033']);f.sql.exec("DELETE FROM simple_grc_records");assert.deepEqual(await reserveRecordCodes(f.db,'Kanıtlar',1,stamp),['EVD-034'])}finally{f.sql.close()}
});


// Execute the actual HTTP handlers against SQLite and both storage adapters.
// Only runtime/auth transport bindings are replaced, never the access/claim code.
function handlers(db:D1Database,bucket?:object) {
  const load=(path:string)=>{
    const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const localRequire=createRequire(resolve(path)),exports:Record<string,(request:unknown)=>Promise<Response>>={};
    const require=(name:string)=>{
      if(name==='next/server')return{NextResponse:Response};
      if(name==='cloudflare:workers')return{env:{DB:db,BUCKET:bucket}};
      if(name.endsWith('/auth/security'))return{requireRole:async()=>({actor:{email:'qa@example.test',role:'Admin'}})};
      return localRequire(name);
    };
    new Function('require','exports',compiled)(require,exports);return exports;
  };
  const current=load('app/api/evidence/route.ts'),history=load('app/api/evidence/history/route.ts');
  const post=(fields:Record<string,string>,version=false)=>{
    const form=new FormData();form.set('file',new File(['proof'],'proof.txt',{type:'text/plain'}));
    for(const [key,value] of Object.entries(fields))form.set(key,value);
    return (version?history:current).POST({headers:new Headers(),formData:async()=>form});
  };
  const get=(key:string,inline=false)=>current.GET({headers:new Headers(),nextUrl:new URL('https://fixture.test/api/evidence?key='+encodeURIComponent(key)+(inline?'&inline=1':''))});
  return{post,get};
}
for(const backend of ['R2','database'])test(`actual handlers preserve valid files and reject invalid/deleted files on ${backend}`,async()=>{
  const f=await fixture(),objects=new Map<string,Uint8Array>();let reads=0;
  const bucket=backend==='R2'?{async put(key:string,bytes:Uint8Array){objects.set(key,bytes)},async get(key:string){reads++;return objects.has(key)?{body:objects.get(key),httpMetadata:{contentType:'text/plain'}}:null},async delete(key:string){objects.delete(key)}}:undefined;
  try{
    f.control();const route=handlers(f.db,bucket),fields={evidenceTitle:'Proof',controlRef:'CTL-001',owner:'QA',period:'2026',status:'Taslak'};
    assert.equal((await route.post({...fields,controlRef:'ctl-999999999'})).status,422);
    assert.equal(objects.size,0);assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM simple_evidence_files').get()!.n),0);
    const response=await route.post(fields);assert.equal(response.status,201);const created=await response.json() as {id:string;code:string};assert.match(created.code,/^EVD-\d{3,}$/);
    const firstKey=String(f.sql.prepare('SELECT file_key FROM evidence_versions WHERE evidence_id=?').get(created.id)!.file_key);
    assert.equal(await (await route.get(firstKey)).text(),'proof');
    assert.equal((await route.post({evidenceId:created.id,changeNote:'Invalid new link',controlRefs:'CTL-999999999'},true)).status,422);
    assert.equal((await route.post({evidenceId:created.id,changeNote:'Valid new version',controlRefs:'CTL-001'},true)).status,201);
    const keys=f.sql.prepare('SELECT file_key FROM evidence_versions WHERE evidence_id=?').all(created.id).map(r=>String(r.file_key));assert.equal(keys.length,2);
    for(const key of keys){assert.equal((await route.get(key)).status,200);assert.equal(await (await route.get(key,true)).text(),'proof')}
    f.sql.prepare('DELETE FROM simple_grc_records WHERE id=?').run(created.id);const readsBefore=reads;
    for(const key of keys){assert.equal((await route.get(key)).status,404);assert.equal((await route.get(key,true)).status,404)}
    assert.equal(reads,readsBefore);assert.equal(f.counts()[2],2);
  }finally{f.sql.close()}
});
for(const backend of ['R2','database'])test(`failed metadata transaction cleans new binary on ${backend}`,async()=>{
  const f=await fixture(),objects=new Map<string,Uint8Array>();const bucket=backend==='R2'?{async put(key:string,bytes:Uint8Array){objects.set(key,bytes)},async delete(key:string){objects.delete(key)}}:undefined;
  try{
    f.sql.exec("CREATE TRIGGER reject_code BEFORE INSERT ON simple_grc_record_codes BEGIN SELECT RAISE(ABORT,'injected code failure'); END");
    const response=await handlers(f.db,bucket).post({evidenceTitle:'Proof',controlRef:'A.5.1',owner:'QA',period:'2026'});assert.equal(response.status,500);
    assert.deepEqual(f.counts(),[0,0,0,0]);assert.equal(objects.size,0);assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM simple_evidence_files').get()!.n),0);
  }finally{f.sql.close()}
});
