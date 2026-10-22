import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync,type SQLInputValue } from 'node:sqlite';
import type { Actor } from '../app/api/auth/security';
import { accountViewState,VIEW_MODULES } from '../app/account-views';
import { ensureAccountViewSchema,readAccountViews,mutateAccountView } from '../app/account-view-store';
import { scopedApiAllowed } from '../app/module-access';
import { registerViewSchema } from '../app/register-view-schema';
const admin:Actor={id:'admin',email:'admin@example.com',name:'Admin',role:'Admin',source:'local'},viewer:Actor={id:'viewer',email:'viewer@example.com',name:'Reader',role:'Viewer',source:'local'},other:Actor={...viewer,id:'other',email:'other@example.com'};
const id='SV-00000000-0000-0000-0000-000000000001',state={query:'Payments',filters:{owner:'Finance'},columns:['title','owner']};
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE local_users(id TEXT PRIMARY KEY,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);INSERT INTO local_users VALUES('admin','admin@example.com','Admin','Active'),('viewer','viewer@example.com','Viewer','Active'),('other','other@example.com','Viewer','Active');");
 let before:(()=>void)|undefined;
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...values:SQLInputValue[]){return prepare(sql,values);},execute(){if(sql.startsWith('INSERT INTO account_views(')){const hook=before;before=undefined;hook?.();}return{results:sqlite.prepare(sql).all(...args),success:true,meta:{changes:1}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
 const db={prepare,async batch(stmts:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const results=stmts.map(stmt=>stmt.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 await ensureAccountViewSchema(db);
 const save=(patch:Record<string,unknown>={},actor=viewer)=>mutateAccountView(db,actor,{id,module:'Risk Assessment',scope:'personal',action:'save',expectedRevision:'',name:'Finance work',state,...patch});
 const read=(actor=viewer,patch:Record<string,unknown>={})=>readAccountViews(db,actor,{module:'Risk Assessment',scope:'personal',...patch});
 return{sqlite,db,save,read,race:(fn:()=>void)=>{before=fn;}};
}
test('account criteria use the same register schemas and reject stored scope, identity, focus and unsupported fields',()=>{
 assert.deepEqual(accountViewState('Risk Assessment',state),state);
 for(const moduleName of VIEW_MODULES.filter(value=>value!=='My Work'))assert.doesNotThrow(()=>accountViewState(moduleName,{query:'',filters:{},columns:registerViewSchema(moduleName).columns}));
 for(const extra of [{auditId:'secret'},{recordId:'secret'},{scope:'organization'},{userId:'admin'},{page:9},{rows:[]}])assert.throws(()=>accountViewState('Risk Assessment',{...state,...extra}),/schema/);
 for(const invalid of [{...state,columns:['unknown']},{...state,filters:{scope:'organization'}},{...state,query:'a'.repeat(1001)},{...state,columns:[]}])assert.throws(()=>accountViewState('Risk Assessment',invalid),/schema/);
 assert.throws(()=>accountViewState('Tedarikçiler',state),/fields/);
 assert.throws(()=>accountViewState('My Work',{query:'',filters:{status:'all',module:'unknown'},columns:['title']}),/schema/);
 assert.doesNotThrow(()=>accountViewState('My Work',{query:'',filters:{status:'overdue',module:'Kanıtlar'},columns:['title','due']}));
});
test('personal views persist across sessions, isolate accounts including administrators, and change only preferences',async()=>{const f=await fixture();try{
 const first=await f.save();const loaded=await f.read({...viewer});assert.equal(loaded.canManage,true);assert.deepEqual(loaded.views[0].state,state);assert.equal(loaded.limit,20);
 assert.equal((await f.read(other)).views.length,0);assert.equal((await f.read(admin)).views.length,0);
 await assert.rejects(f.read(other,{id}),/missing/);await assert.rejects(f.read(admin,{id}),/missing/);
 await assert.rejects(f.save({expectedRevision:first.revision},other),/conflict/);
 const rename=await f.save({action:'rename',expectedRevision:first.revision,name:'Renamed',state:{query:'ignored'}});assert.deepEqual((await f.read()).views[0].state,state);
 const changed={...state,query:'New terms',columns:['owner','title']};const replaced=await f.save({expectedRevision:rename.revision,name:'Renamed',state:changed});assert.deepEqual((await f.read()).views[0].state,changed);
 await assert.rejects(f.save({expectedRevision:rename.revision,name:'Stale'}),/conflict/);
 await f.save({action:'delete',expectedRevision:replaced.revision});assert.equal((await f.read()).views.length,0);await assert.rejects(f.save(),/conflict/);assert.equal(f.sqlite.prepare('SELECT state_json FROM account_views WHERE id=?').get(id)?.state_json,'{}');
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM local_users').get()?.n,3);
}finally{f.sqlite.close();}});
test('team publication is Admin-only and live module access controls list, exact read and personal writes',async()=>{const f=await fixture();try{
 const team=await f.save({scope:'team'},admin);assert.equal((await f.read(viewer,{scope:'team'})).views.length,1);assert.equal((await f.read(viewer,{scope:'team'})).canManage,false);
 for(const action of ['save','rename','delete'])await assert.rejects(f.save({scope:'team',expectedRevision:team.revision,action},viewer),/forbidden/);
 f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(viewer.id,JSON.stringify({mode:'scoped',modules:{Kanıtlar:'read'}}));
 await assert.rejects(f.read(viewer,{scope:'team'}),/forbidden/);await assert.rejects(f.read(viewer,{scope:'team',id}),/forbidden/);await assert.rejects(f.save(),/forbidden/);
 const scoped={...viewer,moduleAccess:{mode:'scoped' as const,modules:{Kanıtlar:'read' as const}}};assert.equal(scopedApiAllowed(scoped,'/api/views','GET'),true);assert.equal(scopedApiAllowed(scoped,'/api/views','POST'),true);assert.equal(scopedApiAllowed(scoped,'/api/views','DELETE'),false);
 const evidence={query:'proof',filters:{reviewStatus:'Pending'},columns:['evidenceTitle']};await f.save({id:'SV-00000000-0000-0000-0000-000000000002',module:'Kanıtlar',state:evidence},viewer);assert.equal((await f.read(viewer,{module:'Kanıtlar'})).views.length,1);
}finally{f.sqlite.close();}});
test('My Work shared criteria preserve caller scope and hide criteria for inaccessible selected modules',async()=>{const f=await fixture();try{
 const work={query:'review',filters:{module:'Kanıtlar',status:'overdue'},columns:['title','owner','status','due']};await f.save({module:'My Work',scope:'team',state:work},admin);
 f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(viewer.id,JSON.stringify({mode:'scoped',modules:{'Risk Assessment':'read'}}));
 assert.equal((await f.read(viewer,{module:'My Work',scope:'team'})).views.length,0);await assert.rejects(f.read(viewer,{module:'My Work',scope:'team',id}),/missing/);
 await assert.rejects(f.save({id:'SV-00000000-0000-0000-0000-000000000003',module:'My Work',state:work}),/forbidden/);
 await f.save({id:'SV-00000000-0000-0000-0000-000000000002',module:'My Work',scope:'team',name:'All accessible work',state:{...work,filters:{status:'all'}}},admin);
 assert.equal((await f.read(viewer,{module:'My Work',scope:'team'})).views.length,1);
}finally{f.sqlite.close();}});
test('atomic guards reject concurrent role, identity, account status, grant, revision and name changes',async()=>{
 for(const sql of ["UPDATE local_users SET role='Editor' WHERE id='viewer'","UPDATE local_users SET email='changed@example.com' WHERE id='viewer'","UPDATE local_users SET status='Disabled' WHERE id='viewer'","INSERT INTO user_module_access VALUES('viewer','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE account_views SET revision='new-revision'"]){const f=await fixture();try{
   const first=await f.save();f.race(()=>f.sqlite.exec(sql));await assert.rejects(f.save({expectedRevision:first.revision,name:'Must not overwrite'}),/conflict/);assert.equal(f.sqlite.prepare('SELECT name FROM account_views').get()?.name,'Finance work');
 }finally{f.sqlite.close();}}
 const f=await fixture();try{const first=await f.save();f.race(()=>f.sqlite.prepare('INSERT INTO account_views SELECT ?,module,scope,owner_id,?,?,state_json,revision,updated_at,0 FROM account_views').run('SV-00000000-0000-0000-0000-000000000002','Collision','collision'));await assert.rejects(f.save({expectedRevision:first.revision,name:'Collision'}),/conflict/);assert.equal((await f.read()).views.find(row=>row.id===id)?.name,'Finance work');}finally{f.sqlite.close();}
});
test('normalized name uniqueness, active capacity, tombstones and explicit incomplete lists',async()=>{const f=await fixture();try{
 await f.save();await assert.rejects(f.save({id:'SV-00000000-0000-0000-0000-000000000002',name:'Ｆinance work'}),/duplicate/);
 const insert=f.sqlite.prepare('INSERT INTO account_views SELECT ?,module,scope,owner_id,?,?,state_json,revision,updated_at,0 FROM account_views WHERE id=?');
 for(let n=2;n<=20;n++)insert.run('extra-'+n,'View '+n,'view '+n,id);
 await assert.rejects(f.save({id:'SV-00000000-0000-0000-0000-000000000002',name:'Over limit'}),/limit/);
 const current=(await f.read()).views.find(row=>row.id===id)!;await f.save({action:'delete',expectedRevision:current.revision});await f.save({id:'SV-00000000-0000-0000-0000-000000000002',name:'Available slot'});
 f.sqlite.prepare('UPDATE account_views SET deleted=0,name=?,name_key=?,state_json=? WHERE id=?').run('Restored fixture','restored fixture',JSON.stringify(state),id);
 const listed=await f.read();assert.equal(listed.views.length,20);assert.equal(listed.complete,false);
}finally{f.sqlite.close();}});
