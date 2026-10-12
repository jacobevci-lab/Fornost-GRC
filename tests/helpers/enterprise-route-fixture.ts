import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as writes from '../../app/enterprise-lifecycle-write';
import * as incidents from '../../app/incidents/domain';
import * as continuity from '../../app/continuity/domain';
import * as policy from '../../app/policy-lifecycle/domain';
import * as vendor from '../../app/third-party-risk/domain';
import * as risk from '../../app/risk-appetite/domain';
import * as regulatory from '../../app/regulatory-intelligence/domain';
// Execute actual route handlers and SQL against transactional SQLite; substitute only platform/auth adapters.
export function fixture(module:'incidents'|'continuity'|'policy-lifecycle'|'third-party-risk'|'risk-appetite'|'regulatory-intelligence') {
 const sqlite=new DatabaseSync(':memory:'); let beforeBatch:(()=>void)|undefined;
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{
  bind(...args:Value[]){return prepare(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return{results:sqlite.prepare(sql).all(...values)};},
  async run(){return this.exec();},
  exec(){const result=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}};}
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const source=readFileSync(`app/api/${module}/route.ts`,'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:Record<string,unknown>={};
 const require=(name:string)=>{
  if(name==='next/server')return{NextResponse:{json:(body:unknown,options:{status:number})=>({body,status:options.status})}};
  if(name==='cloudflare:workers')return{env:{DB:db}};
  if(name==='../auth/security')return{requireRole:async()=>({actor:{role:'Admin',email:'reviewer@example.com'}})};
  if(name==='../integrations/security')return{clean:(x:unknown,n:number)=>String(x??'').trim().slice(0,n)};
  if(name==='../../enterprise-lifecycle-write')return writes;
  if(name==='../../incidents/domain')return incidents;
  if(name==='../../continuity/domain')return continuity;
  if(name==='../../policy-lifecycle/domain')return policy;
  if(name==='../../third-party-risk/domain')return vendor;
  if(name==='../../risk-appetite/domain')return risk;
  if(name==='../../regulatory-intelligence/domain')return regulatory;
  throw new Error(name);
 };
 new Function('require','exports',compiled)(require,exports);
 const post=(body:Record<string,unknown>)=>(exports.POST as (req:unknown)=>Promise<{status:number;body:Record<string,unknown>}> )({headers:new Headers(),json:async()=>body});
 return{sqlite,post,before:(hook:()=>void)=>{beforeBatch=hook;}};
}
