import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readLiveSession} from '../app/api/auth/live-session';
import {canWriteModule} from '../app/module-access';

const now=new Date('2026-10-22T10:10:00Z');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);
 CREATE TABLE local_sessions(id_hash TEXT PRIMARY KEY,user_id TEXT,created_at TEXT,expires_at TEXT,last_seen_at TEXT);
 CREATE TABLE platform_settings(id TEXT PRIMARY KEY,config_json TEXT);
 CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);
 INSERT INTO local_users VALUES('u','User','user@example.com','Editor','Active');
 INSERT INTO local_sessions VALUES('token','u','2026-10-22T10:00:00.000Z','2026-10-22T10:30:00.000Z','2026-10-22T10:09:30.000Z');`);
 const calls:string[]=[];let hook:(()=>void)|undefined;
 function prepare(query:string,args:SQLInputValue[]=[]){return{bind(...values:SQLInputValue[]){return prepare(query,values);},async first(){calls.push(query);return sql.prepare(query).get(...args)||null;},async run(){calls.push(query);const run=hook;hook=undefined;run?.();return sql.prepare(query).run(...args);}};}
 return {sql,calls,db:{prepare} as unknown as D1Database,race:(fn:()=>void)=>{hook=fn;}};
}
test('repeated live session probes use one fresh read each and no recent activity writes',async()=>{const f=fixture();try{
 for(let i=0;i<5;i++)assert.equal((await readLiveSession(f.db,'token',now))?.id,'u');
 assert.equal(f.calls.length,5);assert.ok(f.calls.every(sql=>sql.startsWith('SELECT')));
}finally{f.sql.close();}});
test('session activity refresh is bounded and never moves a concurrent timestamp backwards',async()=>{const f=fixture();try{
 f.sql.exec("UPDATE local_sessions SET last_seen_at='2026-10-22T10:08:00.000Z'");
 await readLiveSession(f.db,'token',now);assert.equal(f.calls.filter(sql=>sql.startsWith('UPDATE')).length,1);
 await readLiveSession(f.db,'token',new Date(now.getTime()+59999));assert.equal(f.calls.filter(sql=>sql.startsWith('UPDATE')).length,1);
 await readLiveSession(f.db,'token',new Date(now.getTime()+60000));assert.equal(f.calls.filter(sql=>sql.startsWith('UPDATE')).length,2);
 f.sql.exec("UPDATE local_sessions SET last_seen_at='2026-10-22T10:08:00.000Z'");f.race(()=>f.sql.exec("UPDATE local_sessions SET last_seen_at='2026-10-22T10:10:01.000Z'"));await readLiveSession(f.db,'token',now);
 assert.equal(f.sql.prepare('SELECT last_seen_at FROM local_sessions').get()?.last_seen_at,'2026-10-22T10:10:01.000Z');
}finally{f.sql.close();}});
test('current grants, role and disabled state are observed on the very next request',async()=>{const f=fixture();try{
 assert.equal(canWriteModule((await readLiveSession(f.db,'token',now))!,'Denetim Yönetimi'),true);
 f.sql.prepare('INSERT INTO user_module_access VALUES(?,?)').run('u',JSON.stringify({mode:'scoped',modules:{'Denetim Yönetimi':'read'}}));
 assert.equal(canWriteModule((await readLiveSession(f.db,'token',now))!,'Denetim Yönetimi'),false);
 f.sql.exec("UPDATE local_users SET role='Viewer'");assert.equal((await readLiveSession(f.db,'token',now))?.role,'Viewer');
 f.sql.exec("UPDATE local_users SET status='Disabled'");assert.equal(await readLiveSession(f.db,'token',now),null);
}finally{f.sql.close();}});
test('revoked, missing and orphaned sessions never authenticate',async()=>{const f=fixture();try{
 assert.equal(await readLiveSession(f.db,'missing',now),null);f.sql.exec('DELETE FROM local_users');assert.equal(await readLiveSession(f.db,'token',now),null);
 f.sql.exec('DELETE FROM local_sessions');assert.equal(await readLiveSession(f.db,'token',now),null);
}finally{f.sql.close();}});
test('shortened lifetime expires immediately and frequent activity never extends issued expiry',async()=>{for(const mode of ['policy','expiry','invalid']){const f=fixture();try{
 if(mode==='policy')f.sql.exec(`INSERT INTO platform_settings VALUES('default','{"sessionTimeoutMinutes":5}')`);
 if(mode==='expiry')f.sql.exec("UPDATE local_sessions SET expires_at='2026-10-22T10:10:00.000Z'");
 if(mode==='invalid')f.sql.exec("UPDATE local_sessions SET created_at='invalid'");
 assert.equal(await readLiveSession(f.db,'token',now),null);assert.equal(f.sql.prepare('SELECT count(*) n FROM local_sessions').get()?.n,0);
}finally{f.sql.close();}}});
test('invalid activity timestamps are repaired without changing session lifetime',async()=>{const f=fixture();try{
 f.sql.exec("UPDATE local_sessions SET last_seen_at='invalid'");assert.equal((await readLiveSession(f.db,'token',now))?.id,'u');
 assert.equal(f.sql.prepare('SELECT last_seen_at FROM local_sessions').get()?.last_seen_at,now.toISOString());
 assert.equal(f.sql.prepare('SELECT expires_at FROM local_sessions').get()?.expires_at,'2026-10-22T10:30:00.000Z');
}finally{f.sql.close();}});
