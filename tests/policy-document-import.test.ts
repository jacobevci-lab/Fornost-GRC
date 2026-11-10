import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/enterprise-route-fixture';
import {policyImportForm,importPolicyFile,downloadPolicyOriginal} from '../app/policy-lifecycle/import-store';
import type {Actor} from '../app/api/auth/security';
import {PDFDocument} from 'pdf-lib';

const user:Actor={id:'maker',email:'maker@example.com',name:'Maker',role:'Editor',source:'local'};
const input=()=>({mode:'new',requestId:'PIM-'+crypto.randomUUID(),code:'POL-IMPORT',title:'Erişim Politikası',classification:'internal',category:'security',audience:'Employees',reviewFrequencyDays:365,owner:user.email,reviewer:'reviewer@example.com',summary:'Imported source document',content:'Access reviews are performed every quarter. Reviewers document their independent decisions and retain evidence.',effectiveDate:'2026-11-11',regulationRefs:['ISO 27001']});
async function source(draft:object){
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Sample policy');
 const bytes=await pdf.save({useObjectStreams:false});
 const form=new FormData();form.append('file',new Blob([Uint8Array.from(bytes)],{type:'application/pdf'}),'Erişim politikası.pdf');form.append('draft',JSON.stringify(draft));form.set('operation','import');
 return policyImportForm(new Request('http://fixture.invalid',{method:'POST',body:form}));
}
async function setup(){
 const f=fixture('policy-lifecycle');await f.post({});
 f.sqlite.exec("CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT); INSERT INTO local_users VALUES('maker','Maker','maker@example.com','Editor','Active'),('checker','Checker','reviewer@example.com','Admin','Active')");
 return f;
}
test('a reviewed draft, original bytes and import receipt commit once and the issued version stays current',async()=>{
 const f=await setup();try{
  const d=input(),s=await source(d),env={DB:f.db};
  const saved=await importPolicyFile(env,user,s);assert.equal(saved.replay,false);
  const meta=(await f.get('view=comparison&versionId='+saved.versionId)).body.selected as {sourceName:string;status:string;content:string};
  assert.deepEqual([meta.sourceName,meta.status,meta.content],[s.name,'draft',d.content]);
  const download=await downloadPolicyOriginal(env,saved.versionId);assert.equal(download.status,200);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),s.bytes);
  assert.equal((await importPolicyFile(env,user,s)).replay,true);
  s.form.set('draft',JSON.stringify({...d,title:'Changed on retry'}));
  await assert.rejects(importPolicyFile(env,user,s),{code:'conflict'});
  const rev={...d,mode:'existing',policyId:saved.policyId,requestId:'PIM-'+crypto.randomUUID()};s.form.set('draft',JSON.stringify(rev));
  await assert.rejects(importPolicyFile(env,user,s),/değişti/);
  f.sqlite.prepare("UPDATE policy_versions SET status='published' WHERE id=?").run(saved.versionId);
  f.sqlite.prepare("UPDATE policy_documents SET current_version_id=?,status='published' WHERE id=?").run(saved.versionId,saved.policyId);
  const newer=await importPolicyFile(env,user,s);
  assert.equal(f.sqlite.prepare('SELECT current_version_id FROM policy_documents').get()!.current_version_id,saved.versionId);
  assert.equal(f.sqlite.prepare('SELECT version_number FROM policy_versions WHERE id=?').get(newer.versionId)!.version_number,2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM policy_import_sources').get()!.n,2);
 }finally{f.sqlite.close()}
});
test('invalid content, ineligible people and read-only roles cannot create or replace a policy; failed database writes remove the attempted object',async()=>{
 const f=await setup();try{
  const d=input(),s=await source(d),objects=new Map<string,Uint8Array>();
  const env={DB:f.db,BUCKET:{put:async(k:string,v:ArrayBuffer|ArrayBufferView)=>{objects.set(k,new Uint8Array(v as ArrayBuffer));},get:async()=>null,delete:async(k:string)=>{objects.delete(k);}}};
  await assert.rejects(importPolicyFile(env,{...user,role:'Viewer'},s),{code:'access'});
  for(const patch of [{content:'X'.repeat(50001)},{content:'short'},{reviewer:user.email},{code:'?'},{riskRefs:['RSK-001'],regulationRefs:[],controlRefs:[]}]){
   s.form.set('draft',JSON.stringify({...d,...patch}));await assert.rejects(importPolicyFile(env,user,s));assert.equal(objects.size,0);
  }
  s.form.set('draft',JSON.stringify(d));f.before(()=>f.sqlite.exec("CREATE TRIGGER fail_import BEFORE INSERT ON policy_import_sources BEGIN SELECT RAISE(ABORT,'forced failure'); END"));
  await assert.rejects(importPolicyFile(env,user,s));assert.equal(objects.size,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM policy_documents').get()!.n,0);
  const form=new FormData();form.set('file',new Blob(['not a PDF']),'bad.pdf');
  await assert.rejects(policyImportForm(new Request('http://fixture.invalid',{method:'POST',body:form})),{code:'invalid'});
  form.set('file',new Blob(['x']),'old.doc');await assert.rejects(policyImportForm(new Request('http://fixture.invalid',{method:'POST',body:form})),{code:'file'});
 }finally{f.sqlite.close()}
});
