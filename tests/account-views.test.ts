import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync,type SQLInputValue } from 'node:sqlite';
import type { Actor } from '../app/api/auth/security';
import { accountViewState,VIEW_MODULES } from '../app/account-views';
import { ensureAccountViewSchema,readAccountViews,mutateAccountView,readTeamViewHistory } from '../app/account-view-store';
import { scopedApiAllowed } from '../app/module-access';
import { registerViewSchema } from '../app/register-view-schema';
const admin:Actor={id:'admin',email:'admin@example.com',name:'Admin',role:'Admin',source:'local'},viewer:Actor={id:'viewer',email:'viewer@example.com',name:'Reader',role:'Viewer',source:'local'},other:Actor={...viewer,id:'other',email:'other@example.com'};
const id='SV-00000000-0000-0000-0000-000000000001',state={query:'Payments',filters:{owner:'Finance'},columns:['title','owner']};
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE local_users(id TEXT PRIMARY KEY,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);INSERT INTO local_users VALUES('admin','admin@example.com','Admin','Active'),('viewer','viewer@example.com','Viewer','Active'),('other','other@example.com','Viewer','Active');");
 let before:(()=>void)|undefined,beforeRead:(()=>void)|undefined;
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...values:SQLInputValue[]){return prepare(sql,values);},execute(){if(sql.startsWith('SELECT 1 AS allowed')){const hook=beforeRead;beforeRead=undefined;hook?.();}if(sql.startsWith('INSERT INTO account_views(')){const hook=before;before=undefined;hook?.();}return{results:sqlite.prepare(sql).all(...args),success:true,meta:{changes:1}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
 const db={prepare,async batch(stmts:ReturnType<typeof prepare>[]){sqlite.exec('BEGIN');try{const results=stmts.map(stmt=>stmt.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 await ensureAccountViewSchema(db);
 const save=(patch:Record<string,unknown>={},actor=viewer)=>mutateAccountView(db,actor,{id,module:'Risk Assessment',scope:'personal',action:'save',expectedRevision:'',name:'Finance work',state,...patch});
 const read=(actor=viewer,patch:Record<string,unknown>={})=>readAccountViews(db,actor,{module:'Risk Assessment',scope:'personal',...patch});
 return{sqlite,db,save,read,race:(fn:()=>void)=>{before=fn;},raceRead:(fn:()=>void)=>{beforeRead=fn;}};
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

test('team changes retain immutable author, reason and exact snapshots; reasoned restore creates a new revision',async()=>{const f=await fixture();try{
 const first=await f.save({scope:'team',note:'Initial publication'},admin);
 const second=await f.save({scope:'team',expectedRevision:first.revision,name:'Changed',state:{...state,query:'New criteria'},note:'Quarterly update'},admin);
 const third=await f.save({scope:'team',action:'rename',expectedRevision:second.revision,name:'Latest name'},admin);
 const history=await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id,revision:first.revision});
 assert.equal(history.current.revision,third.revision);assert.deepEqual(history.selected.state,state);assert.equal(history.selected.name,'Finance work');assert.deepEqual(history.history.map(v=>v.version),[3,2,1]);assert.equal(history.history[2].actor,admin.email);assert.equal(history.history[2].note,'Initial publication');
 const restore={scope:'team',action:'restore',expectedRevision:third.revision,sourceRevision:first.revision,name:undefined,state:undefined};
 await assert.rejects(f.save(restore,admin),/reason/);await assert.rejects(f.save({...restore,note:'  x  '},admin),/reason/);await assert.rejects(f.save({...restore,note:'x'.repeat(501)},admin),/fields/);
 await assert.rejects(f.save({...restore,note:'Restore approved',name:'Injected'},admin),/fields/);await assert.rejects(f.save({...restore,note:'Restore approved',state:{...state,query:'Injected'}},admin),/fields/);
 const restored=await f.save({...restore,note:' Restore approved '},admin);assert.notEqual(restored.revision,first.revision);
 const latest=await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id});assert.deepEqual(latest.current.state,state);assert.equal(latest.current.name,'Finance work');assert.equal(latest.history[0].version,4);assert.equal(latest.history[0].action,'restore');assert.equal(latest.history[0].sourceRevision,first.revision);assert.equal(latest.history[0].note,'Restore approved');
 assert.throws(()=>f.sqlite.exec("UPDATE team_view_versions SET note='tampered'"),/immutable-view-version/);assert.throws(()=>f.sqlite.exec('DELETE FROM team_view_versions'),/immutable-view-version/);
 await f.save({scope:'team',action:'delete',expectedRevision:restored.revision},admin);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM team_view_versions').get()?.n,5);assert.equal(f.sqlite.prepare('SELECT state_json FROM account_views').get()?.state_json,'{}');
 await assert.rejects(readTeamViewHistory(f.db,admin,{module:'Risk Assessment',scope:'team',id}),/missing/);await assert.rejects(f.save({...restore,expectedRevision:restored.revision,note:'Recreate removed'},admin),/conflict/);
}finally{f.sqlite.close();}});

test('history retains a legacy baseline only on the first successful team change and invents no author',async()=>{const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO account_views VALUES(?,?,?,?,?,?,?,?,?,0)').run(id,'Risk Assessment','team','','Legacy','legacy',JSON.stringify(state),'legacy-revision','2026-01-01T00:00:00Z');
 assert.equal((await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id})).history.length,0);
 const changed=await f.save({scope:'team',expectedRevision:'legacy-revision',name:'Updated'},admin);
 const history=await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id,revision:'legacy-revision'});
 assert.equal(history.history.length,2);assert.equal(history.history[1].action,'baseline');assert.equal(history.history[1].actor,'');assert.equal(history.history[1].createdAt,'2026-01-01T00:00:00Z');assert.equal(history.selected.name,'Legacy');
 await f.save({scope:'team',expectedRevision:changed.revision,name:'Another update'},admin);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM team_view_versions WHERE action='baseline'").get()?.n,1);
}finally{f.sqlite.close();}});

test('failed history writes roll back current changes, legacy capture, removal and restore atomically',async()=>{
 for(const action of ['save','rename','delete','restore']){const f=await fixture();try{
  const first=await f.save({scope:'team'},admin);const second=await f.save({scope:'team',expectedRevision:first.revision,name:'Current'},admin);
  f.sqlite.exec("CREATE TRIGGER fail_version BEFORE INSERT ON team_view_versions BEGIN SELECT RAISE(ABORT,'history-unavailable'); END");
  await assert.rejects(f.save({scope:'team',action,expectedRevision:second.revision,name:action==='restore'?undefined:'Failure',state:action==='restore'?undefined:state,...(action==='restore'?{sourceRevision:first.revision,note:'Restore reason'}:{})},admin),/history-unavailable/);
  const row=(await f.read(viewer,{scope:'team'})).views[0];assert.equal(row.name,'Current');assert.equal(row.revision,second.revision);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM team_view_versions').get()?.n,2);
 }finally{f.sqlite.close();}}
 const f=await fixture();try{f.sqlite.exec("CREATE TRIGGER fail_version BEFORE INSERT ON team_view_versions BEGIN SELECT RAISE(ABORT,'history-unavailable'); END");await assert.rejects(f.save({scope:'team'},admin),/history-unavailable/);assert.equal((await f.read(viewer,{scope:'team'})).views.length,0);}finally{f.sqlite.close();}
});

test('team restore rechecks active identity, role, module policy, revision and normalized name at commit',async()=>{
 for(const sql of ["UPDATE local_users SET role='Editor' WHERE id='admin'","UPDATE local_users SET email='changed@example.com' WHERE id='admin'","UPDATE local_users SET status='Disabled' WHERE id='admin'","INSERT INTO user_module_access VALUES('admin','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE account_views SET revision='new-revision'"]){const f=await fixture();try{
  const first=await f.save({scope:'team'},admin),second=await f.save({scope:'team',expectedRevision:first.revision,name:'Changed'},admin);f.race(()=>f.sqlite.exec(sql));
  await assert.rejects(f.save({scope:'team',action:'restore',name:undefined,state:undefined,expectedRevision:second.revision,sourceRevision:first.revision,note:'Restore previous'},admin),/conflict/);assert.equal(f.sqlite.prepare('SELECT name FROM account_views').get()?.name,'Changed');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM team_view_versions').get()?.n,2);
 }finally{f.sqlite.close();}}
 const f=await fixture();try{const first=await f.save({scope:'team'},admin),second=await f.save({scope:'team',expectedRevision:first.revision,name:'Changed'},admin);await f.save({scope:'team',id:'SV-00000000-0000-0000-0000-000000000002'},admin);await assert.rejects(f.save({scope:'team',action:'restore',name:undefined,state:undefined,expectedRevision:second.revision,sourceRevision:first.revision,note:'Restore previous'},admin),/duplicate/);}finally{f.sqlite.close();}
});

test('history and restore enforce team scope, exact view ownership, current access and historical My Work module access',async()=>{const f=await fixture();try{
 const privateView=await f.save();assert.equal(f.sqlite.prepare('SELECT count(*) n FROM team_view_versions').get()?.n,0);
 await assert.rejects(readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'personal',id}),/fields/);await assert.rejects(readTeamViewHistory(f.db,admin,{module:'Risk Assessment',scope:'team',id}),/missing/);
 await assert.rejects(f.save({action:'restore',expectedRevision:privateView.revision,sourceRevision:'unknown',name:undefined,state:undefined,note:'Private restore'}),/fields/);
 const workId='SV-00000000-0000-0000-0000-000000000002',work={query:'',filters:{module:'Kanıtlar',status:'all'},columns:['title']};
 const first=await f.save({id:workId,module:'My Work',scope:'team',state:work},admin),second=await f.save({id:workId,module:'My Work',scope:'team',state:{...work,filters:{status:'all'}},expectedRevision:first.revision},admin);
 f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(viewer.id,JSON.stringify({mode:'scoped',modules:{'Risk Assessment':'read'}}));
 const history=await readTeamViewHistory(f.db,viewer,{module:'My Work',scope:'team',id:workId});assert.deepEqual(history.history.map(row=>row.revision),[second.revision]);await assert.rejects(readTeamViewHistory(f.db,viewer,{module:'My Work',scope:'team',id:workId,revision:first.revision}),/missing/);
 await assert.rejects(f.save({id:workId,module:'My Work',scope:'team',action:'restore',expectedRevision:second.revision,sourceRevision:first.revision,note:'Denied restore',name:undefined,state:undefined},viewer),/forbidden/);
 await assert.rejects(f.save({id:workId,module:'My Work',scope:'team',action:'restore',expectedRevision:second.revision,sourceRevision:privateView.revision,note:'Wrong view restore',name:undefined,state:undefined},admin),/missing/);
 const third=await f.save({id:workId,module:'My Work',scope:'team',state:work,expectedRevision:second.revision},admin);assert.ok(third);await assert.rejects(readTeamViewHistory(f.db,viewer,{module:'My Work',scope:'team',id:workId,revision:second.revision}),/missing/);
 f.sqlite.prepare('UPDATE local_users SET status=? WHERE id=?').run('Disabled',admin.id);await assert.rejects(readTeamViewHistory(f.db,admin,{module:'My Work',scope:'team',id:workId}),/forbidden/);
}finally{f.sqlite.close();}});

test('history is explicitly bounded while older exact revisions remain retained and restorable',async()=>{const f=await fixture();try{
 const first=await f.save({scope:'team'},admin);let revision=first.revision;
 for(let n=2;n<=52;n++)revision=(await f.save({scope:'team',name:'Version '+n,expectedRevision:revision},admin)).revision;
 const recent=await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id});assert.equal(recent.history.length,50);assert.equal(recent.historyComplete,false);assert.equal(recent.history[0].version,52);assert.equal(recent.history.at(-1)?.version,3);
 assert.deepEqual((await readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id,revision:first.revision})).selected.state,state);
 await f.save({scope:'team',action:'restore',expectedRevision:revision,sourceRevision:first.revision,note:'Restore retained version',name:undefined,state:undefined},admin);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM team_view_versions').get()?.n,53);
}finally{f.sqlite.close();}});


test('history reads reject identity and permission changes between authorization and the snapshot transaction',async()=>{
 for(const sql of ["UPDATE local_users SET status='Disabled' WHERE id='viewer'","UPDATE local_users SET role='Editor' WHERE id='viewer'","UPDATE local_users SET email='changed@example.com' WHERE id='viewer'","INSERT INTO user_module_access VALUES('viewer','{\"mode\":\"scoped\",\"modules\":{}}')"]){const f=await fixture();try{
  await f.save({scope:'team'},admin);f.raceRead(()=>f.sqlite.exec(sql));await assert.rejects(readTeamViewHistory(f.db,viewer,{module:'Risk Assessment',scope:'team',id}),/forbidden/);
 }finally{f.sqlite.close();}}
});
