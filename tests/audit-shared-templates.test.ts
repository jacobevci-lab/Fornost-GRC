import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import type {Actor} from '../app/api/auth/security';
import {ensureSharedTemplateSchema,listSharedTemplates,readSharedTemplate,mutateSharedTemplate} from '../app/audit-shared-template-store';
import {validateSharedTemplate} from '../app/audit-shared-templates';
import {scopedApiAllowed} from '../app/module-access';
const admin:Actor={id:'admin',name:'Admin',email:'admin@example.com',role:'Admin',source:'local'};
const id='AST-00000000-0000-0000-0000-000000000001';
const template={version:1,kind:'task-pack',name:'Reusable audit',chain:true,tasks:[{title:'Agree scope',description:'Confirm review criteria'},{title:'Prepare evidence',description:'Review relevant period'}]};
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE local_users(id TEXT PRIMARY KEY,email TEXT,role TEXT,status TEXT);INSERT INTO local_users VALUES('admin','admin@example.com','Admin','Active');");
 let before:(()=>void)|undefined;
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...values:SQLInputValue[]){return prepare(sql,values);},execute(){return{results:sqlite.prepare(sql).all(...args),success:true,meta:{changes:1}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
 const db={prepare,async batch(stmts:ReturnType<typeof prepare>[]){const hook=before;before=undefined;hook?.();sqlite.exec('BEGIN');try{const results=stmts.map(stmt=>stmt.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 await ensureSharedTemplateSchema(db);
 const save=(patch:Record<string,unknown>={},actor=admin)=>mutateSharedTemplate(db,actor,{id,action:'save',expectedRevision:'',template,note:'Approved reusable content',...patch});
 return{db,sqlite,save,race:(fn:()=>void)=>{before=fn;}};
}
test('shared definitions validate every kind and exclude assignments, dates, IDs, status and oversized packs',()=>{
 assert.deepEqual(validateSharedTemplate(template),template);
 assert.deepEqual(validateSharedTemplate({version:1,kind:'plan',name:'Plan',fields:{scope:'Selected systems'}}),{version:1,kind:'plan',name:'Plan',fields:{scope:'Selected systems'}});
 assert.deepEqual(validateSharedTemplate({version:1,kind:'milestone',name:'Task',fields:{title:'Review results'}}),{version:1,kind:'milestone',name:'Task',fields:{title:'Review results'}});
 for(const key of ['owner','dueDate','timeZone','status','dependsOn','remindersEnabled','recurrence'])assert.throws(()=>validateSharedTemplate({...template,tasks:[{...template.tasks[0],[key]:'unexpected'}]}));
 for(const value of [{...template,version:2},{...template,kind:'unknown'},{...template,name:''},{...template,tasks:[]},{...template,tasks:Array(13).fill(template.tasks[0])},{...template,chain:'true'},{...template,tasks:[{title:'Hi',description:''}]},{...template,fields:{}},{version:1,kind:'plan',name:'Plan',fields:{lead:'someone'}},{version:1,kind:'milestone',name:'Task',fields:{dueDate:'2026-01-01'}}])assert.throws(()=>validateSharedTemplate(value));
});
test('shared definitions persist once, update by revision, preserve immutable historical content and archive/reactivate without changing copies',async()=>{const f=await fixture();try{
 const first=await f.save();assert.equal(first.version,1);await assert.rejects(f.save(),/conflict/);
 let read=await readSharedTemplate(f.db,admin,id);const copy=structuredClone(read.selected.template);assert.equal(read.history.length,1);assert.equal(read.current.archived,false);
 const second=await f.save({expectedRevision:first.revision,template:{...template,name:'Updated audit',tasks:[{title:'Changed scope',description:'New approach'}]}});
 assert.equal(second.version,2);const old=await readSharedTemplate(f.db,admin,id,first.revision);assert.deepEqual(old.selected.template,template);assert.equal(old.current.name,'Updated audit');assert.deepEqual(copy,template);
 await assert.rejects(f.save({expectedRevision:first.revision}),/conflict/);
 const archived=await f.save({action:'archive',expectedRevision:second.revision});assert.equal((await listSharedTemplates(f.db,admin,'task-pack')).templates.length,0);assert.equal((await listSharedTemplates(f.db,admin,'task-pack',true)).templates.length,1);
 await assert.rejects(f.save({expectedRevision:archived.revision}),/transition/);await assert.rejects(f.save({action:'archive',expectedRevision:archived.revision}),/transition/);
 const restored=await f.save({action:'restore',expectedRevision:archived.revision});assert.equal(restored.version,4);read=await readSharedTemplate(f.db,admin,id);assert.equal(read.current.archived,false);assert.deepEqual(read.history.map(v=>v.action),['restore','archive','save','save']);
 assert.throws(()=>f.sqlite.prepare('UPDATE audit_shared_template_versions SET note=?').run('Tampered'),/immutable-template-version/);assert.throws(()=>f.sqlite.exec('DELETE FROM audit_shared_template_versions'),/immutable-template-version/);
 await assert.rejects(readSharedTemplate(f.db,admin,id,'unknown'),/missing/);
}finally{f.sqlite.close();}});
test('library roles and audit module boundaries restrict both lists and exact historical reads',async()=>{const f=await fixture();try{
 await f.save();const reader:Actor={...admin,role:'Viewer',moduleAccess:{mode:'scoped',modules:{'Denetim Yönetimi':'read'}}},denied:Actor={...reader,moduleAccess:{mode:'scoped',modules:{}}};
 assert.equal((await listSharedTemplates(f.db,reader,'task-pack')).canManage,false);assert.equal((await readSharedTemplate(f.db,reader,id)).selected.name,template.name);
 await assert.rejects(listSharedTemplates(f.db,denied,'task-pack'),/forbidden/);await assert.rejects(readSharedTemplate(f.db,denied,id),/forbidden/);
 for(const role of ['Viewer','Editor'] as const)await assert.rejects(f.save({}, {...admin,role}),/forbidden/);
 assert.equal(scopedApiAllowed(reader,'/api/audits/templates','GET'),true);assert.equal(scopedApiAllowed(reader,'/api/audits/templates','POST'),false);assert.equal(scopedApiAllowed(denied,'/api/audits/templates','GET'),false);
}finally{f.sqlite.close();}});
test('concurrent revision, role, status and actor identity changes cannot publish a version',async()=>{
 for(const sql of ["UPDATE local_users SET role='Editor'","UPDATE local_users SET status='Disabled'","UPDATE local_users SET email='other@example.com'","UPDATE audit_shared_templates SET revision='concurrent'"]){const f=await fixture();try{
  const first=await f.save();f.race(()=>f.sqlite.exec(sql));await assert.rejects(f.save({expectedRevision:first.revision,template:{...template,name:'Must not publish'}}),/conflict/);
  assert.equal(f.sqlite.prepare('SELECT name FROM audit_shared_templates').get()?.name,template.name);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_shared_template_versions').get()?.n,1);
 }finally{f.sqlite.close();}}
});
test('history failures roll back current definition and version number; invalid kind and empty reasons never write',async()=>{const f=await fixture();try{
 const first=await f.save();f.sqlite.exec("CREATE TRIGGER fail_history BEFORE INSERT ON audit_shared_template_versions BEGIN SELECT RAISE(ABORT,'history-failed');END");
 await assert.rejects(f.save({expectedRevision:first.revision,template:{...template,name:'Rollback'}}),/history-failed/);assert.equal((await readSharedTemplate(f.db,admin,id)).current.revision,first.revision);
 f.sqlite.exec('DROP TRIGGER fail_history');await assert.rejects(f.save({expectedRevision:first.revision,template:{version:1,kind:'plan',name:'Wrong kind',fields:{scope:'Scope'}}}),/fields/);await assert.rejects(f.save({expectedRevision:first.revision,note:' '}),/fields/);
}finally{f.sqlite.close();}});
test('library capacity counts archives, listing completeness and retained history bounds are explicit',async()=>{const f=await fixture();try{
 const first=await f.save();const row=f.sqlite.prepare('SELECT * FROM audit_shared_templates').get()!;
 const insert=f.sqlite.prepare('INSERT INTO audit_shared_templates VALUES(?,?,?,?,?,?,?,?,?,?)');for(let n=1;n<200;n++)insert.run('extra-'+n,row.kind,row.name,row.revision,row.version,n%2,row.template_json,row.created_at,row.updated_at,row.updated_by);
 await assert.rejects(f.save({id:'AST-00000000-0000-0000-0000-000000000002'}),/conflict/);
 const updated=await f.save({expectedRevision:first.revision});assert.equal(updated.version,2);
 for(let n=200;n<403;n++)insert.run('extra-'+n,row.kind,row.name,row.revision,row.version,0,row.template_json,row.created_at,row.updated_at,row.updated_by);
 const list=await listSharedTemplates(f.db,admin,'task-pack');assert.equal(list.templates.length,200);assert.equal(list.complete,false);
 const event=f.sqlite.prepare('INSERT INTO audit_shared_template_versions VALUES(?,?,?,?,?,?,?,?)');for(let n=3;n<=52;n++)event.run('revision-'+n,id,n,'save',admin.email,'Retained',JSON.stringify((await readSharedTemplate(f.db,admin,id)).selected),'2026-10-22');
 const read=await readSharedTemplate(f.db,admin,id);assert.equal(read.history.length,50);assert.equal(read.historyComplete,false);assert.deepEqual((await readSharedTemplate(f.db,admin,id,first.revision)).selected.template,template);
}finally{f.sqlite.close();}});
