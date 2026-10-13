import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeCoreRecord,type CoreRecordSnapshot} from '../app/core-record-write';
import {LifecycleConflict} from '../app/enterprise-lifecycle-write';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,data_json TEXT,updated_at TEXT)');
 sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?)').run('record',JSON.stringify({asset:'AST-original',processLink:'BIA-original'}),'2099-01-01T00:00:00.000Z');
 const read=()=>({...sqlite.prepare('SELECT data_json,updated_at FROM simple_grc_records WHERE id=?').get('record')}) as CoreRecordSnapshot;
 const db={prepare:(sql:string)=>({bind:(...values:unknown[])=>({run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values as (string|number|null)[]).changes)}})})})} as unknown as D1Database;
 return{sqlite,read,db};
}
test('stale client cannot overwrite newer asset and BIA links',async()=>{const f=fixture();try{const old=f.read();const stamp=await writeCoreRecord(f.db,'record',old,{asset:'AST-new',processLink:'BIA-new'},old.updated_at);assert.ok(stamp>old.updated_at);const fresh=f.read();await assert.rejects(writeCoreRecord(f.db,'record',fresh,{asset:'AST-original',processLink:'BIA-original'},old.updated_at),LifecycleConflict);assert.deepEqual(f.read(),fresh);}finally{f.sqlite.close();}});
test('same-millisecond or future-stamped writes advance monotonically',async()=>{const f=fixture();try{const first=f.read();await writeCoreRecord(f.db,'record',first,{title:'first'},first.updated_at);const second=f.read();assert.equal(Date.parse(second.updated_at)-Date.parse(first.updated_at),1);await writeCoreRecord(f.db,'record',second,{title:'second'},second.updated_at);assert.ok(f.read().updated_at>second.updated_at);}finally{f.sqlite.close();}});
test('concurrent modification or deletion rejects the server snapshot',async()=>{for(const sql of ["UPDATE simple_grc_records SET data_json='{}'","DELETE FROM simple_grc_records"]){const f=fixture();try{const before=f.read();f.sqlite.exec(sql);await assert.rejects(writeCoreRecord(f.db,'record',before,{title:'stale'},before.updated_at),LifecycleConflict);if(sql.startsWith('UPDATE'))assert.equal(f.read().data_json,'{}');}finally{f.sqlite.close();}}});
test('malformed supplied versions fail without writing; omitted legacy version remains supported',async()=>{const f=fixture();try{const before=f.read();for(const version of [null,'',123,{},'x'.repeat(65)]){await assert.rejects(writeCoreRecord(f.db,'record',before,{title:'invalid'},version));assert.deepEqual(f.read(),before);}await writeCoreRecord(f.db,'record',before,{title:'legacy'},undefined);assert.equal(JSON.parse(f.read().data_json).title,'legacy');}finally{f.sqlite.close();}});
test('database failure preserves content and version',async()=>{const f=fixture();try{const before=f.read();f.sqlite.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON simple_grc_records BEGIN SELECT RAISE(ABORT,'injected failure'); END");await assert.rejects(writeCoreRecord(f.db,'record',before,{title:'failed'},before.updated_at));assert.deepEqual(f.read(),before);}finally{f.sqlite.close();}});
