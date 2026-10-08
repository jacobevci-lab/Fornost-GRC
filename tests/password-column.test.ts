import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensurePasswordIterationsColumn } from '../app/api/auth/password-column';

test('concurrent legacy repairs preserve credentials and tolerate only the duplicate ALTER race',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE local_users(id TEXT PRIMARY KEY,password_hash TEXT); INSERT INTO local_users VALUES('existing','unchanged');");
 let reads=0,release!:()=>void;
 const bothRead=new Promise<void>(resolve=>{release=resolve;});
 const db={prepare(query:string){return {
  async all(){const results=sql.prepare(query).all();if(++reads===2)release();await bothRead;return {results};},
  async run(){return sql.prepare(query).run();},
 };}} as unknown as D1Database;
 try{
  await Promise.all([ensurePasswordIterationsColumn(db),ensurePasswordIterationsColumn(db)]);
  const row=sql.prepare('SELECT * FROM local_users').get()!;
  assert.equal(row.password_iterations,100000);assert.equal(row.password_hash,'unchanged');
  await ensurePasswordIterationsColumn(db);
 }finally{sql.close();}
});
test('legacy repair propagates operational failures and duplicate errors for other columns',async()=>{
 for(const message of ['database is locked','D1 timeout','duplicate column name: password_iterations_backup','duplicate column name: role']){
  const error=new Error(message);
  const db={prepare(){return {async all(){return {results:[]};},async run(){throw error;}};}} as unknown as D1Database;
  await assert.rejects(ensurePasswordIterationsColumn(db),caught=>caught===error);
 }
});
