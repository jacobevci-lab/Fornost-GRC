import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {emptyAuditPlan,validateAuditPlan,saveAuditPlan} from '../app/audit-plan';
import {scopedApiAllowed} from '../app/module-access';
test('audit plan rejects malformed fields and incomplete, reversed or impossible dates',()=>{
 assert.deepEqual(validateAuditPlan(emptyAuditPlan),emptyAuditPlan);
 for(const value of [null,{},[],{...emptyAuditPlan,scope:3},{...emptyAuditPlan,scope:'x'.repeat(4001)},{...emptyAuditPlan,periodStart:'2026-01-01'},{...emptyAuditPlan,periodStart:'2026-02-30',periodEnd:'2026-03-02'},{...emptyAuditPlan,fieldworkStart:'2026-03-02',fieldworkEnd:'2026-03-01'}])assert.throws(()=>validateAuditPlan(value));
 assert.equal(validateAuditPlan({...emptyAuditPlan,scope:' Scope '}).scope,'Scope');
});
test('audit plan writes require live parent and exact current revision including concurrent initial creation',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE simple_audits(id TEXT PRIMARY KEY);CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);INSERT INTO simple_audits VALUES(\'a\'),(\'b\')');
 function prepare(sql:string,args:string[]=[]){return{bind(...values:string[]){return prepare(sql,values);},async all(){return{results:sqlite.prepare(sql).all(...args)};}};}
 const db={prepare} as unknown as D1Database;
 try{assert.equal(await saveAuditPlan(db,'missing','',emptyAuditPlan,'a'),null);assert.equal(await saveAuditPlan(db,'a','stale',emptyAuditPlan,'a'),null);
 const first=await saveAuditPlan(db,'a','',emptyAuditPlan,'a');assert.ok(first);assert.equal(await saveAuditPlan(db,'a','',emptyAuditPlan,'b'),null);
 const next=await saveAuditPlan(db,'a',first.revision,{...emptyAuditPlan,scope:'Updated'},'b');assert.ok(next);assert.equal(next.updatedBy,'b');assert.equal(await saveAuditPlan(db,'a',first.revision,emptyAuditPlan,'a'),null);assert.equal(await saveAuditPlan(db,'b',next.revision,emptyAuditPlan,'a'),null);
 sqlite.exec("DELETE FROM simple_audits WHERE id='a'");assert.equal(await saveAuditPlan(db,'a',next.revision,emptyAuditPlan,'a'),null);
 }finally{sqlite.close();}
});
test('scoped audit-plan access follows audit read and write permissions',()=>{
 const subject={role:'Editor',moduleAccess:{mode:'scoped',modules:{'Denetim Yönetimi':'read'}}} as Parameters<typeof scopedApiAllowed>[0];
 assert.equal(scopedApiAllowed(subject,'/api/audits/plan','GET'),true);assert.equal(scopedApiAllowed(subject,'/api/audits/plan','PUT'),false);
});
