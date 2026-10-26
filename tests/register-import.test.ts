import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { parseImportSheet, mappedImport, validateImportRows, RegisterImportError, importIssueText } from '../app/register-import';
import { previewRegisterImport, commitRegisterImport } from '../app/register-import-store';
import { auditClosureSchema } from '../app/audit-closure-schema';
import type { Actor } from '../app/api/auth/security';
const token='10000000-0000-4000-8000-000000000001', now=new Date('2026-10-26T12:00:00Z');
const actor:Actor={id:'editor',email:'editor@example.com',name:'Editor',role:'Editor',source:'local'};
const row=(title='Imported')=>({title,owner:'Operations',asset:'AST-001'});
test('physical columns and Excel row numbers survive blank headers/rows and typed dates',()=>{
 const sheet=parseImportSheet([['Title','', 'Owner','Asset','Next review'],['First','','Operations','AST-001',new Date('2026-11-20T00:00:00Z')],[],['Second',null,'Security','AST-001','2026-12-01']]);
 assert.deepEqual(sheet.columns.map(c=>c.index),[0,2,3,4]);
 const mapped=mappedImport(sheet,{'0':'title','2':'owner','3':'asset','4':'nextReview'},['title','owner','asset','nextReview']);
 assert.deepEqual(mapped.sourceRows,[2,4]);assert.equal(sheet.blankRows,1);assert.equal(mapped.rows[0].owner,'Operations');assert.equal(mapped.rows[0].nextReview,'2026-11-20');
 assert.equal(validateImportRows('Risk Assessment',mapped.rows).issues.length,0);
});
test('ambiguous headers, unmapped populated columns and size limits never silently shift/truncate data',()=>{
 for(const sheet of [[['Title','','Owner'],['x','value','owner']],[['Title',' title '],['x','y']],[Array.from({length:101},(_,i)=>'Column'+i),Array.from({length:101},()=>1)],[['Title'],...Array.from({length:1001},()=>['x'])]])assert.throws(()=>parseImportSheet(sheet),RegisterImportError);
 const sheet=parseImportSheet([['Title','Another','Owner'],['x','y','owner']]);
 assert.throws(()=>mappedImport(sheet,{'0':'title','1':'title'},['title','owner']),/duplicate-mapping/);
 const result=mappedImport(sheet,{'0':'title'},['title']);assert.equal(result.ignoredColumns,2);assert.equal(result.rows[0].title,'x');
 assert.equal(parseImportSheet([['Title'],...Array.from({length:1000},()=>['x'])]).rows.length,1000);
});
test('strict rows reject oversized fields and invalid dates before canonical normalization; managed risk decisions are not imported',()=>{
 assert.equal(validateImportRows('Risk Assessment',[row('x'.repeat(1001))]).issues[0].code,'cell-length');
 assert.equal(validateImportRows('Risk Assessment',[{...row(),nextReview:'2026-02-31'}]).issues[0].code,'validation');
 assert.equal(validateImportRows('Risk Assessment',[{...row(),owner:{nested:true}}]).issues[0].code,'cell-type');
 const checked=validateImportRows('Risk Assessment',[{...row(),likelihood:'3',impact:'4',riskReviewApprovedBy:'forged'}]);
 assert.equal(checked.issues.length,0);assert.equal(checked.rows[0].status,'Değerlendiriliyor');assert.equal(checked.rows[0].inherentLikelihood,'3');assert.equal(checked.rows[0].riskReviewApprovedBy,undefined);
 assert.match(importIssueText({code:'validation',detail:'Zorunlu alanlar eksik: owner, asset'},'en',{owner:'Owner',asset:'Asset'}),/Owner, Asset/);
});
test('all eight register contracts use canonical required fields, dates, statuses and import bounds',()=>{
 const fixtures:Record<string,Record<string,unknown>>={
  'Risk Assessment':row(),BIA:{process:'Order',processCategory:'Operations',businessUnit:'Ops',owner:'Ops',criticality:'High',asset:'AST-001',rto:'2',rpo:'1',status:'Aktif'},
  'Varlık Envanteri':{title:'Server',assetType:'Server',businessUnit:'Ops',owner:'Ops',criticality:'High',status:'Aktif'},
  Uyum:{framework:'Custom',controlRef:'Control',controlTitle:'Access',owner:'Ops',status:'Uyumlu'},
  Tedarikçiler:{title:'Vendor',service:'Service',owner:'Ops',criticality:'High',riskLevel:'Low',status:'Aktif'},
  Kontroller:{controlRef:'Control',controlTitle:'Access',owner:'Ops',frequency:'Yearly',implementation:'Uygulanıyor',status:'Aktif'},
  Kanıtlar:{evidenceTitle:'Proof',controlRef:'Control',owner:'Ops',period:'2026',status:'Taslak'},
  'Denetim Yönetimi':{auditName:'QA',auditType:'Internal',auditOwner:'Ops',startDate:'2026-01-01',endDate:'2026-12-31',requirementRef:'REQ-1',requirementTitle:'Access',owner:'Ops',businessUnit:'Ops',dueDate:'2026-12-01',status:'Başlanmadı',progress:'0'},
 };
 for(const [module,value] of Object.entries(fixtures)){assert.deepEqual(validateImportRows(module,[value]).issues,[]);assert.equal(validateImportRows(module,[{...value,owner:''}]).issues.length,1);}
 assert.throws(()=>validateImportRows('Risk Assessment',Array.from({length:1001},()=>row())),/rows-limit/);
});
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT UNIQUE,created_at TEXT);CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE local_users(id TEXT PRIMARY KEY,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE audit_closure_state(audit_id TEXT PRIMARY KEY,state TEXT);INSERT INTO local_users VALUES('editor','editor@example.com','Editor','Active'),('other','other@example.com','Editor','Active');INSERT INTO simple_grc_records VALUES('asset','Varlık Envanteri','{}','now','now');INSERT INTO simple_grc_record_codes VALUES('asset','Varlık Envanteri','AST-001','now');`);
 let hook:(()=>void)|undefined,n=0;
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...values:SQLInputValue[]){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},exec(){const before=sqlite.prepare('SELECT total_changes() n').get()!.n as number;const results=sqlite.prepare(sql).all(...args);return{results,meta:{changes:Number(sqlite.prepare('SELECT total_changes() n').get()!.n)-before}}}};}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const run=hook;hook=undefined;run?.();sqlite.exec('BEGIN');try{const results=statements.map(statement=>statement.exec());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}}as unknown as D1Database;
 const allocate=async(_module:string,rows:Record<string,unknown>[])=>rows.map(data=>({id:'RSK-'+(++n),code:'RSK-'+n,data}));
 const commit=(input:unknown=[row()],id=token,who=actor)=>commitRegisterImport(db,who,'Risk Assessment',input,id,allocate,now);
 const counts=()=>['simple_grc_records','simple_grc_record_codes','simple_grc_metadata'].map(table=>Number(sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n));
 return{sqlite,db,commit,counts,allocate,race:(fn:()=>void)=>{hook=fn}};
}
test('server preview is read-only, checks current access/references, and rejects all invalid rows',async()=>{const f=fixture();try{
 const before=f.counts(),p=await previewRegisterImport(f.db,actor,'Risk Assessment',[row()]);assert.equal(p.rows[0].status,'Değerlendiriliyor');assert.deepEqual(f.counts(),before);
 await assert.rejects(previewRegisterImport(f.db,actor,'Risk Assessment',[row(),{title:'Bad'}]),(e:unknown)=>e instanceof RegisterImportError&&e.issues[0].row===2);
 await assert.rejects(previewRegisterImport(f.db,actor,'Risk Assessment',[{...row(),asset:'AST-999'}]),/reference-unavailable/);
 f.sqlite.exec("INSERT INTO user_module_access VALUES('editor','{\"mode\":\"scoped\",\"modules\":{\"Risk Assessment\":\"read\"}}')");await assert.rejects(previewRegisterImport(f.db,actor,'Risk Assessment',[row()]),/forbidden/);assert.deepEqual(f.counts(),before);
}finally{f.sqlite.close();}});
test('lost response and concurrent identical retries have one atomic receipt and one batch',async()=>{const f=fixture();try{
 const results=await Promise.all([f.commit(),f.commit()]);assert.equal(results.filter(r=>!r.replayed).length,1);assert.deepEqual(f.counts(),[2,2,1]);
 const retry=await f.commit();assert.equal(retry.replayed,true);assert.deepEqual(f.counts(),[2,2,1]);
 await assert.rejects(f.commit([row('Changed')]),/import-conflict/);assert.deepEqual(f.counts(),[2,2,1]);
 f.sqlite.exec("DELETE FROM simple_grc_records WHERE module='Risk Assessment'");assert.equal((await f.commit()).replayed,true);assert.equal(f.counts()[0],1,'a receipt must not resurrect removed records');
}finally{f.sqlite.close();}});
test('receipts are actor scoped and cannot bypass current permissions',async()=>{const f=fixture();try{
 await f.commit();const other={...actor,id:'other',email:'other@example.com'};assert.equal((await f.commit([row()],token,other)).replayed,false);assert.deepEqual(f.counts(),[3,3,2]);
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='editor'");await assert.rejects(f.commit(),/forbidden/);
}finally{f.sqlite.close();}});
test('live role/policy/reference races never leave rows, codes or a receipt',async()=>{
 for(const sql of ["UPDATE local_users SET role='Viewer' WHERE id='editor'","UPDATE local_users SET email='changed@example.com' WHERE id='editor'","INSERT INTO user_module_access VALUES('editor','{\"mode\":\"scoped\",\"modules\":{}}')","DELETE FROM simple_grc_records WHERE id='asset'"]){const f=fixture();try{f.race(()=>f.sqlite.exec(sql));await assert.rejects(f.commit());assert.equal(f.sqlite.prepare("SELECT count(*) n FROM simple_grc_records WHERE module='Risk Assessment'").get()!.n,0);assert.deepEqual(f.counts().slice(1),[1,0]);}finally{f.sqlite.close();}}
});
test('code and receipt failures roll back the complete batch even with trigger-inclusive changes metadata',async()=>{
 for(const table of ['simple_grc_record_codes','simple_grc_metadata']){const f=fixture();try{
  f.sqlite.exec(`CREATE TABLE events(value TEXT);CREATE TRIGGER event AFTER INSERT ON simple_grc_records BEGIN INSERT INTO events VALUES(NEW.id);END;CREATE TRIGGER failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected');END;`);
  await assert.rejects(f.commit([row('One'),row('Two')]),/injected/);assert.deepEqual(f.counts(),[1,1,0]);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM events').get()!.n,0);
 }finally{f.sqlite.close();}}
 const f=fixture();try{f.sqlite.exec('CREATE TABLE events(value TEXT);CREATE TRIGGER event AFTER INSERT ON simple_grc_records BEGIN INSERT INTO events VALUES(NEW.id);END;');await f.commit();assert.deepEqual(f.counts(),[2,2,1]);}finally{f.sqlite.close();}
});
test('closed audit preview and a close between preview and commit reject the complete import',async()=>{const f=fixture();try{
 const requirement={auditName:'QA',auditType:'Internal',auditOwner:'Ops',startDate:'2026-01-01',endDate:'2026-12-31',requirementRef:'REQ-1',requirementTitle:'Access',owner:'Ops',businessUnit:'Ops',dueDate:'2026-12-01',status:'Başlanmadı',progress:'0'};
 f.sqlite.exec("INSERT INTO simple_audits VALUES('qa','QA');INSERT INTO audit_closure_state VALUES('qa','closed');");
 await assert.rejects(previewRegisterImport(f.db,actor,'Denetim Yönetimi',[requirement]),/audit-closed/);
 f.sqlite.exec("UPDATE audit_closure_state SET state='open'");await previewRegisterImport(f.db,actor,'Denetim Yönetimi',[requirement]);
 f.sqlite.exec(auditClosureSchema.find(sql=>sql.includes('CREATE TRIGGER IF NOT EXISTS audit_closure_simple_grc_records_insert'))!);
 f.race(()=>f.sqlite.exec("UPDATE audit_closure_state SET state='closed'"));
 await assert.rejects(commitRegisterImport(f.db,actor,'Denetim Yönetimi',[requirement],token,f.allocate,now),/audit-closed/);assert.deepEqual(f.counts(),[1,1,0]);
}finally{f.sqlite.close();}});
