import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import test from 'node:test';
import {changeAccount,createAccount,directoryEntry} from '../app/api/users/account-store';
import {readLiveSession} from '../app/api/auth/live-session';

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password_hash TEXT,password_salt TEXT,password_iterations INTEGER,role TEXT,status TEXT,failed_attempts INTEGER DEFAULT 0,locked_until TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE local_sessions(id_hash TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,created_at TEXT,last_seen_at TEXT);
 CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT,updated_at TEXT,updated_by TEXT);
 CREATE TABLE user_access_events(id TEXT PRIMARY KEY,user_id TEXT,actor TEXT,before_json TEXT,after_json TEXT,created_at TEXT);
 CREATE TABLE platform_settings(id TEXT PRIMARY KEY,config_json TEXT);
 INSERT INTO local_users(id,name,email,role,status) VALUES ('admin','Admin','admin@qa.invalid','Admin','Active');`);
 type Value=string|number|null;
 let beforeBatch:(()=>void)|undefined;
 function prepare(query:string,values:Value[]=[]){return {bind(...v:Value[]){return prepare(query,v);},first:async()=>sql.prepare(query).get(...values)||null,run:()=>({meta:{changes:Number(sql.prepare(query).run(...values).changes)}})};}
 const db={prepare,async batch(steps:ReturnType<typeof prepare>[]){beforeBatch?.();beforeBatch=undefined;sql.exec('BEGIN');try{const result=steps.map(x=>x.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const admin={id:'admin',email:'admin@qa.invalid'},body={name:'Temp',email:'temp@qa.invalid',role:'Editor'},password={hash:'unit',salt:'salt',iterations:100000};
 function read(id:string){return directoryEntry(sql.prepare('SELECT u.*,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').get(id) as Parameters<typeof directoryEntry>[0]);}
 function deletion(id:string){const user=read(id);return {id,email:user.email,expectedRevision:user.revision};}
 return {sql,db,admin,body,password,read,deletion,before(cb:()=>void){beforeBatch=cb;}};
}
test('create, edit, scope, revoke and delete preserve exact identity and audit history',async()=>{
 const f=fixture();try{
  const id=await createAccount(f.db,f.admin,f.body,f.password);
  await assert.rejects(createAccount(f.db,f.admin,f.body,f.password),{code:'duplicate'});
  const original=f.deletion(id);
  f.sql.prepare("INSERT INTO local_sessions VALUES('token',?,'2099-01-01','2026-01-01','2026-01-01')").run(id);
  await changeAccount(f.db,f.admin,{id,name:'Updated',role:'Viewer',status:'Active',expectedRevision:original.expectedRevision,moduleAccess:{mode:'scoped',modules:{BIA:'write'}}},false);
  assert.deepEqual(f.read(id).moduleAccess,{mode:'scoped',modules:{BIA:'read'}});assert.equal(f.read(id).name,'Updated');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM local_sessions').get()!.n,0);
  await assert.rejects(changeAccount(f.db,f.admin,original,true),{code:'stale'});
  f.sql.prepare("INSERT INTO local_sessions VALUES('delete-token',?,'2099-01-01','2026-01-01','2026-01-01')").run(id);
  const target=f.deletion(id);
  await assert.rejects(changeAccount(f.db,f.admin,{...target,email:'other@qa.invalid'},true),{code:'invalid'});
  await changeAccount(f.db,f.admin,target,true);
  assert.equal(await readLiveSession(f.db,'delete-token'),null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM local_sessions').get()!.n,0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_module_access WHERE user_id=?').get(id)!.n,0);
  assert.equal(f.sql.prepare('SELECT id FROM local_users WHERE id=?').get(id),undefined);
  const event=f.sql.prepare("SELECT * FROM user_access_events WHERE user_id=? AND id GLOB 'local-delete:*'").get(id)!;
  assert.equal(JSON.parse(String(event.after_json)).email,f.body.email);assert.equal(event.actor,f.admin.email);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_access_events WHERE user_id=?').get(id)!.n,3);
  const fresh=await createAccount(f.db,f.admin,{...f.body,role:'Viewer'},f.password);assert.notEqual(fresh,id);
  await assert.rejects(changeAccount(f.db,f.admin,target,true),{code:'missing'});assert.ok(f.read(fresh));
 }finally{f.sql.close();}
});
test('the account claim checks self-deletion, current authority, concurrent edits and the last active administrator at commit',async()=>{
 const f=fixture();try{
  await assert.rejects(changeAccount(f.db,f.admin,f.deletion(f.admin.id),true),{code:'self'});
  await assert.rejects(changeAccount(f.db,f.admin,{id:f.admin.id,role:'Editor',status:'Active'},false),{code:'last-admin'});
  const id=await createAccount(f.db,f.admin,{...f.body,role:'Admin'},f.password);
  const old=f.deletion(id);
  f.before(()=>f.sql.prepare("UPDATE local_users SET name='Other update' WHERE id=?").run(id));
  await assert.rejects(changeAccount(f.db,f.admin,old,true),{code:'stale'});
  f.before(()=>f.sql.exec("UPDATE local_users SET status='Disabled' WHERE id='admin'"));
  await assert.rejects(changeAccount(f.db,f.admin,f.deletion(id),true));
  assert.equal(f.read(id).status,'Active');
  await assert.rejects(createAccount(f.db,f.admin,{...f.body,email:'other@qa.invalid'},f.password));
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM user_access_events WHERE id GLOB 'local-delete:*'").get()!.n,0);
 }finally{f.sql.close();}
});
test('a failed removal rolls back its session, grants and access event together',async()=>{
 const f=fixture();try{
  const id=await createAccount(f.db,f.admin,f.body,f.password);
  f.sql.prepare("INSERT INTO local_sessions VALUES('active',?,'2099-01-01','2026-01-01','2026-01-01')").run(id);
  f.sql.exec("CREATE TRIGGER stop_delete BEFORE DELETE ON local_users BEGIN SELECT RAISE(ABORT,'storage failure'); END;");
  await assert.rejects(changeAccount(f.db,f.admin,f.deletion(id),true),/storage failure/);
  assert.equal(f.read(id).email,f.body.email);
  assert.equal(f.sql.prepare("SELECT user_id FROM local_sessions WHERE id_hash='active'").get()!.user_id,id);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM user_module_access WHERE user_id=?").get(id)!.n,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM user_access_events WHERE id GLOB 'local-delete:*'").get()!.n,0);
 }finally{f.sql.close();}
});
