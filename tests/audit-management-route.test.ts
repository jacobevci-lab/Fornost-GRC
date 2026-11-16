import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import type { Actor } from '../app/api/auth/security';
function routeFixture(){
 const sqlite=new DatabaseSync(':memory:');
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...a:SQLInputValue[]){return prepare(sql,a)},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){return this.exec()},exec(){const results=sqlite.prepare(sql).all(...args);return{results,meta:{changes:Number(sqlite.prepare('SELECT changes() n').get()!.n)}}}};}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.exec());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 let actor:Actor={id:'admin',email:'admin@example.com',name:'Admin',role:'Admin',source:'local'};
 const localRequire=createRequire(new URL('../app/api/audits/route.ts',import.meta.url));
 const require=(path:string)=>path==='next/server'?{NextResponse:{json:(body:unknown,init?:{status?:number})=>({body,status:init?.status||200})}}:path==='cloudflare:workers'?{env:{DB:db}}:path==='../auth/security'?{requireRole:async(_req:unknown,roles:string[])=>roles.includes(actor.role)?{actor}:{response:{status:403,body:{error:'forbidden'}}}}:localRequire(path);
 const exports:Record<string,(r:unknown)=>Promise<{status:number;body:Record<string,unknown>}>>={};
 const code=ts.transpileModule(readFileSync('app/api/audits/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',code)(require,exports);
 const call=(method:string,body:unknown={},query='')=>exports[method]({nextUrl:new URL('http://fixture.test/api/audits?'+query),text:async()=>JSON.stringify(body)});
 return{sqlite,call,setActor:(a:Actor)=>{actor=a}};
}
test('management routes enforce role/scope and keep archival distinct from closure',async()=>{
 const f=routeFixture();try{
  assert.equal((await f.call('GET')).status,200);
  f.sqlite.exec("INSERT INTO simple_audits VALUES('audit-a','Audit A','Custom','Internal','Team','Owner','open','2026-01-01','2026-01-01')");
  const patch={id:'audit-a',action:'edit',name:'Renamed audit',audit_type:'Internal',auditor:'Team',audit_owner:'Owner',expectedUpdatedAt:'2026-01-01'};
  f.setActor({id:'viewer',email:'v@example.com',name:'Viewer',role:'Viewer',source:'local'});assert.equal((await f.call('PATCH',patch)).status,403);assert.equal((await f.call('DELETE',{},'id=audit-a')).status,403);assert.equal((await f.call('GET',{},'view=removal&id=audit-a')).status,403);
  f.setActor({id:'editor',email:'e@example.com',name:'Editor',role:'Editor',source:'local'});assert.equal((await f.call('PATCH',{...patch,action:'archive'})).status,403);assert.equal((await f.call('PATCH',patch)).status,200);assert.equal((await f.call('PATCH',patch)).status,409);
  f.setActor({id:'scoped',email:'s@example.com',name:'Scoped',role:'Viewer',source:'local',moduleAccess:{mode:'scoped',modules:{'Denetim Yönetimi':'read'}}});assert.equal((await f.call('GET',{},'view=findings&id=audit-a')).status,403);
  f.setActor({id:'admin',email:'a@example.com',name:'Admin',role:'Admin',source:'local'});
  const row=f.sqlite.prepare("SELECT * FROM simple_audits WHERE id='audit-a'").get()!;
  f.sqlite.exec("INSERT INTO audit_closure_state VALUES('audit-a','closed','r','','')");
  assert.equal((await f.call('PATCH',{...patch,expectedUpdatedAt:row.updated_at})).status,409);
  assert.equal((await f.call('PATCH',{id:'audit-a',action:'archive',expectedUpdatedAt:row.updated_at,expectedVisibilityRevision:''})).status,200);
  const audits=(await f.call('GET')).body.audits as {archived:number;closure_state:string}[];assert.equal(audits[0].archived,1);assert.equal(audits[0].closure_state,'closed');
  const preview=await f.call('GET',{},'view=removal&id=audit-a');assert.equal(preview.status,200);assert.equal(preview.body.blocked,true);
 }finally{f.sqlite.close()}
});
