import {milestoneNotifications,syncMilestoneNotifications,milestoneNotificationCurrent} from '../app/audit-milestone-notifications';
import {defaultAuditReminderProfile} from '../app/audit-reminder-profile';
import {saveAuditReminderProfile} from '../app/audit-reminder-store';
import {syncAssuranceNotificationOutbox} from '../app/assurance-executive-operations';
import {notificationRecordTarget} from '../app/notification-record-link';
import {dispatchAssuranceNotifications} from '../app/assurance-notification-dispatch';
import type {AssuranceDeliveryOutbox} from '../app/assurance-notification-delivery';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import type {Actor} from '../app/api/auth/security';
import {ensureAuditClosureSchema} from '../app/audit-closure-schema';
import {auditClosureBlockers} from '../app/audit-closure';
import {createMilestoneBatch,mutateMilestone,readMilestones,readMilestoneWork} from '../app/audit-milestone-store';
import {resolveRecordLink} from '../app/record-link-store';
import {validateMilestone,nextMilestoneDate} from '../app/audit-milestones';
import {requestDueAt} from '../app/audit-requests';
import {projectEnterpriseWork} from '../app/enterprise-work';
import {readAuditReportSource,createAuditStatusReport,readAuditStatusReport} from '../app/audit-status-report-store';
import {auditStatusReportCsv} from '../app/audit-status-report-export';
import {scopedApiAllowed} from '../app/module-access';
const owner:Actor={id:'o',name:'Owner',email:'owner@example.com',role:'Editor',source:'local'},admin:Actor={...owner,id:'a',email:'admin@example.com',role:'Admin'};
const id='AMT-00000000-0000-0000-0000-000000000001',fields={title:'Planning meeting',description:'Agree scope and review dates',owner:owner.email,dueDate:'2026-10-20',timeZone:'Europe/Istanbul'};
const packItems=()=>[1,2,3,4].map((n,index)=>({id:`AMT-00000000-0000-0000-0000-00000000000${n}`,fields:{...fields,title:`Pack task ${n}`,dependsOn:index?[`AMT-00000000-0000-0000-0000-00000000000${n-1}`]:[]}}));
test('task pack creates all planned tasks, dependency chain, history and My Work together; duplicate requests create nothing',async()=>{const f=await fixture();try{
 const input={auditId:'a',items:packItems()};const result=await createMilestoneBatch(f.db,owner,input);assert.equal(result.ids.length,4);
 const rows=(await readMilestones(f.db,'a')).milestones;assert.equal(rows.length,4);assert.ok(rows.every(row=>row.status==='planned'&&!row.remindersEnabled&&row.recurrence==='none'));
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,4);
 assert.deepEqual((await readMilestoneWork(f.db,owner)).milestones.map(row=>row.blockedCount).sort(),[0,1,1,1]);
 await assert.rejects(createMilestoneBatch(f.db,owner,input),/conflict/);assert.equal((await readMilestones(f.db,'a')).milestones.length,4);
}finally{f.sqlite.close();}});
test('task pack rejects invalid dates, duplicate IDs, cycles, missing prerequisites, elevated assignment and hidden reminder settings without partial writes',async()=>{const f=await fixture();try{
 for(const mode of ['date','duplicate','cycle','missing','owner','reminder','empty','oversize']){
  const items=packItems();if(mode==='date')items[3].fields.dueDate='2026-02-30';if(mode==='duplicate')items[3].id=items[0].id;if(mode==='cycle')items[0].fields.dependsOn=[items[3].id];if(mode==='missing')items[0].fields.dependsOn=['AMT-99999999-0000-0000-0000-000000000001'];if(mode==='owner')items[3].fields.owner=admin.email;if(mode==='reminder')Object.assign(items[0].fields,{remindersEnabled:true});
  await assert.rejects(createMilestoneBatch(f.db,owner,{auditId:'a',items:mode==='empty'?[]:mode==='oversize'?[...items,...items,...items,...items]:items}));assert.equal((await readMilestones(f.db,'a')).milestones.length,0);
 }
 await assert.rejects(createMilestoneBatch(f.db,{...owner,role:'Viewer'},{auditId:'a',items:packItems()}),/forbidden/);
}finally{f.sqlite.close();}});
test('task pack atomically rejects closed audits, cross-audit IDs, revoked accounts, graph races and event failures',async()=>{for(const mode of ['closed','foreign','revoked','graph','event']){const f=await fixture();try{
 if(mode==='closed')f.sqlite.exec("INSERT INTO audit_closure_state VALUES('a','closed','r','','')");
 if(mode==='foreign')await mutateMilestone(f.db,owner,{auditId:'b',id,action:'save',expectedRevision:'',fields,note:''});
 if(mode==='revoked')f.race(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'"));
 if(mode==='graph')f.race(()=>f.sqlite.prepare('INSERT INTO audit_milestones VALUES(?,?,?,?,?,?)').run('AMT-99999999-0000-0000-0000-000000000001','a','r',JSON.stringify({...fields,status:'planned',note:''}),'',''));
 if(mode==='event')f.sqlite.exec("CREATE TRIGGER fail_pack BEFORE INSERT ON audit_milestone_events WHEN json_extract(NEW.snapshot_json,'$.title')='Pack task 3' BEGIN SELECT RAISE(ABORT,'event-failed');END");
 await assert.rejects(createMilestoneBatch(f.db,owner,{auditId:'a',items:packItems()}));assert.equal((await readMilestones(f.db,'a')).milestones.length,mode==='graph'?1:0);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM audit_milestone_events WHERE audit_id='a'").get()?.n,0);
}finally{f.sqlite.close();}}});
test('task pack preserves the 100-task cap and permits active admin assignment',async()=>{const f=await fixture();try{
 const insert=f.sqlite.prepare('INSERT INTO audit_milestones VALUES(?,?,?,?,?,?)');for(let i=0;i<97;i++)insert.run('retained-'+i,'a','r',JSON.stringify({...fields,status:'cancelled',note:''}),'','');
 await assert.rejects(createMilestoneBatch(f.db,admin,{auditId:'a',items:packItems()}),/limit/);assert.equal((await readMilestones(f.db,'a')).milestones.length,97);
 await createMilestoneBatch(f.db,admin,{auditId:'a',items:packItems().slice(0,3)});assert.equal((await readMilestones(f.db,'a')).milestones.length,100);
}finally{f.sqlite.close();}});
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT);INSERT INTO simple_audits VALUES('a','Audit A','','','','',''),('b','Audit B','','','','','');CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);INSERT INTO local_users VALUES('o','Owner','owner@example.com','Editor','Active'),('a','Admin','admin@example.com','Admin','Active');`);
 let readHook:(()=>void)|undefined;
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...v:SQLInputValue[]){return prepare(sql,v);},execute(){return{results:sqlite.prepare(sql).all(...args),success:true,meta:{changes:1}};},async all(){if(sql==='SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY id LIMIT 101'){const next=readHook;readHook=undefined;next?.();}return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
 let hook:(()=>void)|undefined;
 const db={prepare,async batch(stmts:ReturnType<typeof prepare>[]){const next=hook;hook=undefined;next?.();sqlite.exec('BEGIN');try{const result=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 await ensureAuditClosureSchema(db);
 const row=async()=>(await readMilestones(db,'a')).milestones.find(m=>m.id===id);
 const act=async(action:string,actor=owner,extra:Record<string,unknown>={})=>mutateMilestone(db,actor,{auditId:'a',id,action,expectedRevision:(await row())?.revision||'',fields,note:'Documented outcome or reason',...extra},new Date('2026-10-20T10:00:00Z'));
 return{db,sqlite,row,act,raceRead:(f:()=>void)=>{readHook=f;},race:(f:()=>void)=>{hook=f;}};
}
test('milestones validate fields, real dates and IANA zones; deadlines honor DST',()=>{
 assert.deepEqual(validateMilestone(fields),fields);
 for(const p of [{title:'x'},{dueDate:'2026-02-30'},{owner:'no-email'},{timeZone:'Mars/Base'},{description:'x'.repeat(2001)}])assert.throws(()=>validateMilestone({...fields,...p}));
 assert.equal(requestDueAt('2026-10-20','Europe/Istanbul'),'2026-10-20T20:59:59.999Z');
 assert.equal(requestDueAt('2026-11-01','America/New_York'),'2026-11-02T04:59:59.999Z');
});
test('owner lifecycle preserves atomic history and never duplicates a repeated create',async()=>{const f=await fixture();try{
 await f.act('save');const first=(await f.row())!;await assert.rejects(f.act('save',owner,{expectedRevision:''}),/conflict/);
 await f.act('start');assert.equal((await f.row())?.status,'in_progress');await f.act('complete');assert.equal((await f.row())?.status,'completed');
 await assert.rejects(f.act('save'),/transition/);await f.act('reopen');await f.act('cancel');assert.equal((await f.row())?.status,'cancelled');await f.act('reopen');
 assert.equal((await f.row())?.createdAt,first.createdAt);
 assert.deepEqual(f.sqlite.prepare('SELECT action FROM audit_milestone_events ORDER BY rowid').all().map(r=>r.action),['save','start','complete','reopen','cancel','reopen']);
 await assert.rejects(f.act('complete',owner,{note:''}),/note/);
}finally{f.sqlite.close();}});
test('roles, cross-parent IDs, current grants and active assignments are enforced',async()=>{const f=await fixture();try{
 await assert.rejects(f.act('save',{...owner,role:'Viewer'}),/forbidden/);
 await assert.rejects(f.act('save',owner,{fields:{...fields,owner:admin.email}}),/owner/);
 await f.act('save');await assert.rejects(f.act('save',owner,{auditId:'b',expectedRevision:''}),/conflict/);
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'");await assert.rejects(f.act('complete',admin),/assignee/);await f.act('cancel',admin);await f.act('reopen',admin);
 await f.act('save',admin,{fields:{...fields,owner:admin.email}});await assert.rejects(f.act('start',owner),/owner/);
 const scoped={...owner,moduleAccess:{mode:'scoped' as const,modules:{'Denetim Yönetimi':'read' as const}}};
 assert.equal(scopedApiAllowed(scoped,'/api/audits/milestones','GET'),true);assert.equal(scopedApiAllowed(scoped,'/api/audits/milestones','POST'),false);
}finally{f.sqlite.close();}});
test('concurrent role, policy and revision changes roll back and do not append history',async()=>{for(const change of ["UPDATE local_users SET role='Viewer' WHERE id='o'","INSERT INTO user_module_access VALUES('o','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE audit_milestones SET revision='concurrent' WHERE id='"+id+"'"]){const f=await fixture();try{
 await f.act('save');f.race(()=>f.sqlite.exec(change));await assert.rejects(f.act('complete'),/conflict/);assert.equal((await f.row())?.status,'planned');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,1);
}finally{f.sqlite.close();}}});
test('event insertion failure rolls back task and report revision; closed audits reject every write',async()=>{const f=await fixture();try{
 await f.act('save');const revision=(await f.row())?.revision,source=f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision;
 f.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON audit_milestone_events BEGIN SELECT RAISE(ABORT,'event-failed');END");await assert.rejects(f.act('start'),/event-failed/);assert.equal((await f.row())?.revision,revision);assert.equal(f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision,source);f.sqlite.exec('DROP TRIGGER fail_event');
 f.sqlite.exec("INSERT INTO audit_closure_state VALUES('a','closed','r','','')");await assert.rejects(f.act('start'),/audit-closed/);assert.throws(()=>f.sqlite.prepare('DELETE FROM audit_milestones WHERE id=?').run(id),/audit-closed/);
}finally{f.sqlite.close();}});
test('My Work projects exact parent, owner, local due time and terminal state without description/history',async()=>{const f=await fixture();try{
 await f.act('save');let work=await readMilestoneWork(f.db,owner);assert.equal(work.milestones[0].dueAt,'2026-10-20T20:59:59.999Z');assert.equal('description' in work.milestones[0],false);
 const projection=projectEnterpriseWork('audit',{requests:[],...work});assert.equal(projection.complete,true);assert.equal(projection.rows[0].workKind,'audit-milestone');assert.equal(projection.rows[0].data.auditId,'a');
 await f.act('complete');work=await readMilestoneWork(f.db,owner);assert.equal(projectEnterpriseWork('audit',{requests:[],...work}).rows[0].data.workClosed,true);
 assert.equal(projectEnterpriseWork('audit',{requests:[],complete:true,milestones:[work.milestones[0],work.milestones[0]]}).complete,false);
 f.sqlite.exec("DELETE FROM simple_audits WHERE id='a'");assert.equal((await readMilestoneWork(f.db,owner)).milestones.length,0);await assert.rejects(readMilestones(f.db,'a'),/audit-missing/);
}finally{f.sqlite.close();}});
test('milestones block closure, participate in report hashes and preserve historical exports',async()=>{const f=await fixture();try{
 await f.act('save');const source=await readAuditReportSource(f.db,admin,'a');assert.equal(source.items.filter(i=>i.kind==='milestone').length,1);assert.ok(auditClosureBlockers(source).includes('milestones'));
 const reportId='ARP-'+crypto.randomUUID();await createAuditStatusReport(f.db,admin,{auditId:'a',reportId,expectedSourceRevision:source.sourceRevision,title:'Milestone report',summary:'Current audit schedule and task outcomes',limitations:''});
 await f.act('complete');const next=await readAuditReportSource(f.db,admin,'a');assert.notEqual(next.sourceRevision,source.sourceRevision);assert.ok(!auditClosureBlockers(next).includes('milestones'));
 const saved=await readAuditStatusReport(f.db,admin,'a',reportId);assert.equal(saved.integrity,'verified');assert.equal(saved.snapshot.items[0].record.data.status,'planned');assert.match(auditStatusReportCsv(saved,false),/Planning meeting/);
 f.sqlite.prepare("UPDATE audit_status_report_items SET record_json='{}' WHERE report_id=?").run(reportId);assert.equal((await readAuditStatusReport(f.db,admin,'a',reportId)).integrity,'broken');
}finally{f.sqlite.close();}});
test('per-audit capacity and inbox bounds are explicit, cancelled tasks retain their place',async()=>{const f=await fixture();try{
 const insert=f.sqlite.prepare('INSERT INTO audit_milestones VALUES(?,?,?,?,?,?)');for(let i=0;i<100;i++)insert.run('bulk-'+i,'a','r',JSON.stringify({...fields,status:'cancelled',note:'Retained'}),'','');await assert.rejects(f.act('save'),/conflict/);
 for(let i=100;i<1001;i++)insert.run('bulk-'+i,'b','r',JSON.stringify({...fields,status:'planned',note:''}),'','');const work=await readMilestoneWork(f.db,owner);assert.equal(work.milestones.length,1000);assert.equal(work.complete,false);
}finally{f.sqlite.close();}});

test('milestone links enforce audit grants, exact parent and existence without requiring write access',async()=>{const f=await fixture();try{
 await f.act('save');const target={module:'Denetim Yönetimi',kind:'audit-milestone',ref:id,auditId:'a'};
 const reader={role:'Viewer' as const,moduleAccess:{mode:'scoped' as const,modules:{'Denetim Yönetimi':'read' as const}}};
 assert.deepEqual(await resolveRecordLink(f.db,reader,target),target);
 assert.equal(await resolveRecordLink(f.db,{...reader,moduleAccess:{mode:'scoped',modules:{}}},target),null);
 assert.equal(await resolveRecordLink(f.db,admin,{...target,auditId:'b'}),null);
 assert.equal(await resolveRecordLink(f.db,admin,{...target,ref:'missing'}),null);
 await f.act('cancel');assert.deepEqual(await resolveRecordLink(f.db,reader,target),target);
 f.sqlite.exec("DELETE FROM simple_audits WHERE id='a'");assert.equal(await resolveRecordLink(f.db,reader,target),null);
}finally{f.sqlite.close();}});

const secondId='AMT-00000000-0000-0000-0000-000000000002';
async function dependencyAct(f:Awaited<ReturnType<typeof fixture>>,target:string,action:string,extra:Record<string,unknown>={}) {
 const row=(await readMilestones(f.db,'a')).milestones.find(row=>row.id===target);
 return mutateMilestone(f.db,owner,{auditId:'a',id:target,action,expectedRevision:row?.revision||'',fields:{...fields,title:'Dependent task'},note:'Documented dependency change',...extra});
}
test('dependencies block start and completion, canceled predecessors do not satisfy them, and legacy saves preserve links',async()=>{const f=await fixture();try{
 await f.act('save');await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:[id]}});
 await assert.rejects(dependencyAct(f,secondId,'start'),/dependency-blocked/);await assert.rejects(dependencyAct(f,secondId,'complete'),/dependency-blocked/);
 await f.act('cancel');await assert.rejects(dependencyAct(f,secondId,'start'),/dependency-blocked/);
 await dependencyAct(f,secondId,'save');assert.deepEqual((await readMilestones(f.db,'a')).milestones.find(row=>row.id===secondId)?.dependsOn,[id]);
 const work=await readMilestoneWork(f.db,owner);assert.equal(work.milestones.find(row=>row.id===secondId)?.blockedCount,1);
 assert.equal(projectEnterpriseWork('audit',{requests:[],...work}).rows.find(row=>row.nativeRef===secondId)?.data.blockedCount,1);
 await f.act('reopen');await f.act('complete');await dependencyAct(f,secondId,'start');
 await assert.rejects(f.act('reopen'),/dependency-blocked/);await dependencyAct(f,secondId,'complete');await assert.rejects(f.act('reopen'),/dependency-blocked/);
 await dependencyAct(f,secondId,'reopen');await f.act('reopen');
}finally{f.sqlite.close();}});
test('self references, cycles, duplicate and cross-audit prerequisites reject without appending events',async()=>{const f=await fixture();try{
 await f.act('save');await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:[id]}});
 const count=()=>f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n;
 const before=count();await assert.rejects(f.act('save',owner,{fields:{...fields,dependsOn:[id]}}),/dependency-cycle/);
 await assert.rejects(f.act('save',owner,{fields:{...fields,dependsOn:[secondId]}}),/dependency-cycle/);
 assert.throws(()=>validateMilestone({...fields,dependsOn:[secondId,secondId]}),/dependencies/);
 assert.throws(()=>validateMilestone({...fields,dependsOn:'invalid'}),/dependencies/);
 const foreign='AMT-00000000-0000-0000-0000-000000000003';await mutateMilestone(f.db,owner,{auditId:'b',id:foreign,action:'save',expectedRevision:'',fields,note:''});
 await assert.rejects(f.act('save',owner,{fields:{...fields,dependsOn:[foreign]}}),/dependency-missing/);assert.equal(count(),Number(before)+1);
}finally{f.sqlite.close();}});
test('graph snapshot blocks concurrent predecessor reopen and concurrent cycle creation',async()=>{for(const scenario of ['reopen','cycle']){const f=await fixture();try{
 await f.act('save');if(scenario==='reopen')await f.act('complete');await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:scenario==='reopen'?[id]:[]}});
 f.race(()=>{f.sqlite.prepare("UPDATE audit_milestones SET data_json=json_set(data_json,?,json(?)),revision='raced' WHERE id=?").run(scenario==='reopen'?'$.status':'$.dependsOn',JSON.stringify(scenario==='reopen'?'planned':[secondId]),id);});
 const count=f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n;
 await assert.rejects(dependencyAct(f,secondId,scenario==='reopen'?'start':'save',scenario==='cycle'?{fields:{...fields,dependsOn:[id]}}:{}),/conflict/);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,count);assert.equal((await readMilestones(f.db,'a')).milestones.find(row=>row.id===secondId)?.status,'planned');
}finally{f.sqlite.close();}}});
test('dependency edits are included in report snapshots, exports and atomic event history',async()=>{const f=await fixture();try{
 await f.act('save');await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:[id]}});
 const source=await readAuditReportSource(f.db,admin,'a'),reportId='ARP-'+crypto.randomUUID();
 await createAuditStatusReport(f.db,admin,{auditId:'a',reportId,expectedSourceRevision:source.sourceRevision,title:'Dependency report',summary:'Scheduled task dependency snapshot',limitations:''});
 const saved=await readAuditStatusReport(f.db,admin,'a',reportId);assert.equal(saved.integrity,'verified');assert.deepEqual(saved.snapshot.items.find(item=>item.id===secondId)?.record.data.dependsOn,[id]);assert.match(auditStatusReportCsv(saved,false),new RegExp(id));
 await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:[]}});assert.notEqual((await readAuditReportSource(f.db,admin,'a')).sourceRevision,source.sourceRevision);
 assert.deepEqual((await readAuditStatusReport(f.db,admin,'a',reportId)).snapshot.items.find(item=>item.id===secondId)?.record.data.dependsOn,[id]);
}finally{f.sqlite.close();}});


test('recurrence calendar retains month-end anchors, leap years and local deadlines',()=>{
 assert.equal(nextMilestoneDate('2026-01-31','monthly'),'2026-02-28');
 assert.equal(nextMilestoneDate('2026-02-28','monthly',31),'2026-03-31');
 assert.equal(nextMilestoneDate('2026-11-30','quarterly'),'2027-02-28');
 assert.equal(nextMilestoneDate('2028-02-29','yearly'),'2029-02-28');
 assert.equal(nextMilestoneDate('2031-02-28','yearly',29),'2032-02-29');
 assert.equal(nextMilestoneDate('2026-12-28','weekly'),'2027-01-04');
 assert.equal(requestDueAt(nextMilestoneDate('2026-03-01','weekly'),'America/New_York'),'2026-03-09T03:59:59.999Z');
 for(const recurrence of ['daily','',null,3,{}])assert.throws(()=>validateMilestone({...fields,recurrence}),/recurrence/);
 assert.throws(()=>nextMilestoneDate('9999-12-31','weekly'),/dates/);
 assert.throws(()=>nextMilestoneDate('2026-02-30','monthly'),/recurrence/);
});
test('explicit recurrence creates one planned successor, retains calendar anchor and preserves original history',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,dueDate:'2026-01-31',recurrence:'monthly'}});
 await assert.rejects(f.act('repeat'),/transition/);await f.act('complete');const original=await f.row();
 const childResult=await f.act('repeat'),rows=(await readMilestones(f.db,'a')).milestones,child=rows.find(row=>row.id===childResult.id)!;
 assert.equal(child.status,'planned');assert.equal(child.dueDate,'2026-02-28');assert.equal(child.recurrenceDay,31);assert.equal(child.recurrenceOf,id);assert.deepEqual(child.dependsOn,[id]);assert.equal(child.owner,owner.email);assert.equal(child.timeZone,fields.timeZone);
 assert.deepEqual(await f.row(),original);await assert.rejects(f.act('repeat'),/recurrence-exists/);assert.equal((await readMilestones(f.db,'a')).milestones.length,2);
 assert.equal(f.sqlite.prepare('SELECT action FROM audit_milestone_events WHERE milestone_id=?').get(child.id)?.action,'repeat');
 const work=await readMilestoneWork(f.db,owner);assert.equal(work.milestones.find(row=>row.id===child.id)?.dueDate,'2026-02-28');
 await dependencyAct(f,child.id,'complete');const grandchild=await dependencyAct(f,child.id,'repeat');assert.equal((await readMilestones(f.db,'a')).milestones.find(row=>row.id===grandchild.id)?.dueDate,'2026-03-31');
 await assert.rejects(f.act('reopen'),/dependency-blocked/);
}finally{f.sqlite.close();}});
test('recurrence settings survive legacy saves, date edits reset anchors, and cancelled successors are not duplicated',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,dueDate:'2026-01-31',recurrence:'monthly'}});await f.act('complete');const child=await f.act('repeat');
 await dependencyAct(f,child.id,'save',{fields:{...fields,dueDate:'2026-02-28'}});let row=(await readMilestones(f.db,'a')).milestones.find(row=>row.id===child.id)!;assert.equal(row.recurrence,'monthly');assert.equal(row.recurrenceDay,31);assert.equal(row.recurrenceOf,id);
 await dependencyAct(f,child.id,'save',{fields:{...fields,dueDate:'2026-02-20',recurrenceOf:'forged',recurrenceDay:31}});row=(await readMilestones(f.db,'a')).milestones.find(row=>row.id===child.id)!;assert.equal(row.recurrenceDay,20);assert.equal(row.recurrenceOf,id);
 await dependencyAct(f,child.id,'cancel');await assert.rejects(f.act('repeat'),/recurrence-exists/);await assert.rejects(dependencyAct(f,child.id,'repeat'),/transition/);
 await dependencyAct(f,child.id,'reopen');await dependencyAct(f,child.id,'save',{fields:{...fields,recurrence:'none'}});await dependencyAct(f,child.id,'complete');await assert.rejects(dependencyAct(f,child.id,'repeat'),/transition/);
}finally{f.sqlite.close();}});
test('recurrence enforces owner, current source revision, capacity, closure and atomic event writes',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,recurrence:'weekly'}});await f.act('complete');
 await assert.rejects(f.act('repeat',{...owner,id:'other',email:'other@example.com'}),/owner/);await assert.rejects(f.act('repeat',owner,{expectedRevision:'old'}),/conflict/);
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'");await assert.rejects(f.act('repeat',admin),/assignee/);f.sqlite.exec("UPDATE local_users SET status='Active' WHERE id='o'");
 f.sqlite.exec("CREATE TRIGGER fail_repeat_event BEFORE INSERT ON audit_milestone_events WHEN NEW.action='repeat' BEGIN SELECT RAISE(ABORT,'event-failed');END");await assert.rejects(f.act('repeat'),/event-failed/);assert.equal((await readMilestones(f.db,'a')).milestones.length,1);f.sqlite.exec('DROP TRIGGER fail_repeat_event');
 f.sqlite.exec("INSERT INTO audit_closure_state VALUES('a','closed','r','','')");await assert.rejects(f.act('repeat'),/audit-closed/);f.sqlite.exec("DELETE FROM audit_closure_state");
 const insert=f.sqlite.prepare('INSERT INTO audit_milestones VALUES(?,?,?,?,?,?)');for(let i=0;i<99;i++)insert.run('retained-'+i,'a','r',JSON.stringify({...fields,status:'cancelled',note:''}),'','');await assert.rejects(f.act('repeat'),/conflict/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,2);
}finally{f.sqlite.close();}});
test('concurrent source changes and competing recurrence creation never create an extra successor or event',async()=>{for(const mode of ['source','successor']){const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,recurrence:'monthly'}});await f.act('complete');
 f.race(()=>{if(mode==='source')f.sqlite.prepare("UPDATE audit_milestones SET revision='concurrent',data_json=json_set(data_json,'$.status','planned') WHERE id=?").run(id);else f.sqlite.prepare('INSERT INTO audit_milestones VALUES(?,?,?,?,?,?)').run(secondId,'a','concurrent',JSON.stringify({...fields,status:'planned',note:'',recurrence:'monthly',recurrenceOf:id,dependsOn:[id]}),'','');});
 await assert.rejects(f.act('repeat'),/conflict/);assert.equal((await readMilestones(f.db,'a')).milestones.length,mode==='source'?1:2);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,2);
}finally{f.sqlite.close();}}});
test('recurrence and lineage are included in immutable report snapshots and exports',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,recurrence:'quarterly'}});await f.act('complete');const child=await f.act('repeat');const source=await readAuditReportSource(f.db,admin,'a');const reportId='ARP-'+crypto.randomUUID();
 await createAuditStatusReport(f.db,admin,{auditId:'a',reportId,expectedSourceRevision:source.sourceRevision,title:'Recurring milestones',summary:'Calendar tasks and their lineage',limitations:''});
 const report=await readAuditStatusReport(f.db,admin,'a',reportId);const saved=report.snapshot.items.find(item=>item.record.id===child.id)!;assert.equal(saved.record.data.recurrenceOf,id);assert.equal(saved.record.data.recurrence,'quarterly');assert.match(auditStatusReportCsv(report,false),/Quarterly/);
 await dependencyAct(f,child.id,'cancel');assert.equal((await readAuditStatusReport(f.db,admin,'a',reportId)).integrity,'verified');
}finally{f.sqlite.close();}});


test('recurrence rejects a source changed after initial read even when the graph snapshot already contains the new revision',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,recurrence:'monthly'}});await f.act('complete');
 f.raceRead(()=>f.sqlite.prepare("UPDATE audit_milestones SET revision='new-source',data_json=json_set(data_json,'$.dueDate','2027-01-31') WHERE id=?").run(id));
 await assert.rejects(f.act('repeat'),/conflict/);assert.equal((await readMilestones(f.db,'a')).milestones.length,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,2);
}finally{f.sqlite.close();}});


const reminderNow=new Date('2026-10-20T10:00:00Z');
const queuedMilestones=(f:Awaited<ReturnType<typeof fixture>>)=>f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE route='audit-milestone' AND status='queued'").all() as AssuranceDeliveryOutbox[];
test('milestone reminders default off and respect advance, due, overdue, escalation and working days in task time zone',async()=>{const f=await fixture();try{
 await f.act('save');assert.deepEqual(milestoneNotifications((await f.row())!,reminderNow),[]);
 await f.act('save',owner,{fields:{...fields,remindersEnabled:true}});const row=(await f.row())!;
 assert.equal(milestoneNotifications(row,new Date('2026-10-18T10:00Z')).length,0);assert.equal(milestoneNotifications(row,new Date('2026-10-19T10:00Z'))[0].milestone,'due-soon');assert.equal(milestoneNotifications(row,reminderNow)[0].milestone,'due');
 const saved={revision:'p',profile:{...defaultAuditReminderProfile,escalationDays:3,escalationRecipient:admin.email}};
 assert.deepEqual(milestoneNotifications(row,new Date('2026-10-23T10:00Z'),saved).map(n=>n.milestone),['overdue','escalation']);
 assert.equal(milestoneNotifications(row,new Date('2026-10-24T10:00Z'),{...saved,profile:{...saved.profile,mode:'business'}}).length,0);
 assert.equal(milestoneNotifications(row,reminderNow,{...saved,profile:{...saved.profile,mode:'business',holidays:['2026-10-20']}}).length,0);
 assert.equal(milestoneNotifications({...row,timeZone:'America/New_York'},new Date('2026-10-20T01:00Z'))[0].milestone,'due-soon');
 assert.throws(()=>validateMilestone({...fields,remindersEnabled:'true'}),/fields/);
}finally{f.sqlite.close();}});
test('milestone sync deduplicates, omits narratives, preserves audit-only recipients and survives other publishers',async()=>{const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(owner.id,JSON.stringify({mode:'scoped',modules:{'Denetim Yönetimi':'write'}}));
 await f.act('save',owner,{fields:{...fields,remindersEnabled:true}});await syncMilestoneNotifications(f.db,reminderNow);await syncMilestoneNotifications(f.db,reminderNow);let queued=queuedMilestones(f);assert.equal(queued.length,1);assert.equal(queued[0].recipient,owner.email);assert.equal(await milestoneNotificationCurrent(f.db,queued[0],reminderNow),true);
 assert.ok(!queued[0].body.includes(fields.title));assert.ok(!queued[0].body.includes(fields.description));assert.deepEqual(notificationRecordTarget(queued[0]),{module:'Denetim Yönetimi',kind:'audit-milestone',ref:id,auditId:'a'});
 await syncAssuranceNotificationOutbox(f.db,[],true,reminderNow);assert.equal(queuedMilestones(f).length,1);
 const old=queued[0];await f.act('save');assert.equal((await f.row())?.remindersEnabled,true);assert.equal(queuedMilestones(f).length,0);assert.equal(await milestoneNotificationCurrent(f.db,old,reminderNow),false);await syncMilestoneNotifications(f.db,reminderNow);queued=queuedMilestones(f);assert.equal(queued.length,1);
 await f.act('save',owner,{fields:{...fields,remindersEnabled:false}});await syncMilestoneNotifications(f.db,reminderNow);assert.equal(queuedMilestones(f).length,0);
}finally{f.sqlite.close();}});
test('profile changes invalidate milestone mail and resync produces current escalation recipients',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,remindersEnabled:true}});await syncMilestoneNotifications(f.db,reminderNow);const old=queuedMilestones(f)[0];
 await saveAuditReminderProfile(f.db,admin,{auditId:'a',expectedRevision:'',expectedWorkflowRevision:'',profile:{...defaultAuditReminderProfile,escalationDays:3,escalationRecipient:admin.email}});
 assert.equal(queuedMilestones(f).length,0);assert.equal(await milestoneNotificationCurrent(f.db,old,reminderNow),false);
 await syncMilestoneNotifications(f.db,new Date('2026-10-23T10:00Z'));assert.deepEqual(queuedMilestones(f).map(n=>n.recipient).sort(),[admin.email,owner.email]);
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='a'");await syncMilestoneNotifications(f.db,new Date('2026-10-23T10:00Z'));assert.deepEqual(queuedMilestones(f).map(n=>n.recipient),[owner.email]);
}finally{f.sqlite.close();}});
test('closed, deleted, completed and revoked milestones cannot pass the final delivery guard',async()=>{for(const mode of ['closed','deleted','completed','revoked','forged']){const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,remindersEnabled:true}});await syncMilestoneNotifications(f.db,reminderNow);const item=queuedMilestones(f)[0];
 if(mode==='closed')f.sqlite.exec("INSERT INTO audit_closure_state VALUES('a','closed','r','','')");
 if(mode==='deleted')f.sqlite.exec("DELETE FROM simple_audits WHERE id='a'");
 if(mode==='completed')await f.act('complete');
 if(mode==='revoked')f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(owner.id,JSON.stringify({mode:'scoped',modules:{}}));
 if(mode==='forged')item.source_json=JSON.stringify({kind:'audit-milestone',auditId:'b',milestoneId:id,revision:(await f.row())?.revision});
 assert.equal(await milestoneNotificationCurrent(f.db,item,reminderNow),false);
 if(mode!=='forged'){await syncMilestoneNotifications(f.db,reminderNow);assert.equal(queuedMilestones(f).length,0);}
}finally{f.sqlite.close();}}});
test('milestone mutation rollback preserves queued reminders and valid recurrence copies opt-in',async()=>{const f=await fixture();try{
 await f.act('save',owner,{fields:{...fields,remindersEnabled:true,recurrence:'monthly'}});await syncMilestoneNotifications(f.db,reminderNow);const item=queuedMilestones(f)[0];
 f.sqlite.exec("CREATE TRIGGER fail_reminder_event BEFORE INSERT ON audit_milestone_events BEGIN SELECT RAISE(ABORT,'event-failed');END");await assert.rejects(f.act('complete'),/event-failed/);assert.equal(queuedMilestones(f)[0].id,item.id);f.sqlite.exec('DROP TRIGGER fail_reminder_event');
 await f.act('complete');assert.equal(queuedMilestones(f).length,0);const child=await f.act('repeat');assert.equal((await readMilestones(f.db,'a')).milestones.find(m=>m.id===child.id)?.remindersEnabled,true);
 await syncMilestoneNotifications(f.db,reminderNow);assert.equal(queuedMilestones(f).length,0);
}finally{f.sqlite.close();}});
test('real dispatcher uses mocked transport once, preserves exact milestone link, and refuses stale recipient mail',async()=>{const f=await fixture(),originalFetch=globalThis.fetch,sent:string[]=[];try{
 globalThis.fetch=async(_url,init)=>{sent.push(String(init?.body));return new Response('{}',{status:200});};
 f.sqlite.exec("CREATE TABLE integration_settings(kind TEXT,provider TEXT,enabled INTEGER,config_json TEXT,secret_ciphertext TEXT)");f.sqlite.prepare('INSERT INTO integration_settings VALUES(?,?,?,?,NULL)').run('email','email-api',1,JSON.stringify({endpoint:'https://mail.example.com/send',sender:'sender@example.com',applicationUrl:'https://grc.example.com/fornost-grc/'}));
 const due=new Date().toISOString().slice(0,10);await f.act('save',owner,{fields:{...fields,dueDate:due,timeZone:'UTC',remindersEnabled:true}});await syncMilestoneNotifications(f.db,new Date());
 let result=await dispatchAssuranceNotifications(f.db,{}, {actor:admin.email,trigger:'manual'});assert.equal(result.sent,1);assert.equal(sent.length,1);assert.ok(sent[0].includes('kind=audit-milestone'));assert.ok(sent[0].includes('ref='+id));
 result=await dispatchAssuranceNotifications(f.db,{}, {actor:admin.email,trigger:'scheduled'});assert.equal(result.sent,0);assert.equal(sent.length,1);
 await f.act('save',owner,{fields:{...fields,dueDate:due,timeZone:'UTC',remindersEnabled:true}});await syncMilestoneNotifications(f.db,new Date());f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'");result=await dispatchAssuranceNotifications(f.db,{}, {actor:admin.email,trigger:'manual'});assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(sent.length,1);
}finally{globalThis.fetch=originalFetch;f.sqlite.close();}});

const reviewedFields={...fields,reviewer:admin.email,reviewDueDate:'2026-10-23',remindersEnabled:true};
test('independent milestone review assigns only through admin, locks submission, returns and approves with immutable actors',async()=>{const f=await fixture();try{
 await assert.rejects(f.act('save',owner,{fields:reviewedFields}),/review-admin/);
 await f.act('save',admin,{fields:reviewedFields});
 await assert.rejects(f.act('complete'),/review-required/);
 await assert.rejects(f.act('save',owner,{fields:{...fields,reviewer:'',reviewDueDate:''}}),/review-admin/);
 await f.act('save');assert.equal((await f.row())?.reviewer,admin.email);
 await assert.rejects(f.act('submit',admin),/independent-review/);
 await f.act('submit');let row=(await f.row())!;assert.equal(row.status,'submitted');assert.equal(row.submittedBy,owner.email);
 await assert.rejects(f.act('save',admin,{fields:{...fields,reviewer:'',reviewDueDate:''}}),/transition/);
 await assert.rejects(f.act('approve'),/independent-review/);await assert.rejects(f.act('return'),/independent-review/);
 await f.act('return',admin);row=(await f.row())!;assert.equal(row.status,'changes_requested');assert.equal(row.reviewedBy,admin.email);
 await f.act('save');assert.equal((await f.row())?.submittedBy,undefined);await f.act('submit');
 await f.act('approve',admin);row=(await f.row())!;assert.equal(row.status,'completed');assert.equal(row.submittedBy,owner.email);assert.equal(row.reviewedBy,admin.email);
 const events=f.sqlite.prepare("SELECT action,snapshot_json FROM audit_milestone_events ORDER BY rowid").all();assert.deepEqual(events.map(e=>e.action),['save','save','submit','return','save','submit','approve']);
 assert.equal(JSON.parse(String(events[2].snapshot_json)).status,'submitted');
 await f.act('reopen');row=(await f.row())!;assert.equal(row.reviewer,admin.email);assert.equal(row.reviewedBy,undefined);await assert.rejects(f.act('complete'),/review-required/);
}finally{f.sqlite.close();}});
test('review assignment rejects self review, partial dates, invalid dates, earlier review and disabled reviewers',async()=>{const f=await fixture();try{
 for(const extra of [{reviewer:owner.email},{reviewDueDate:'2026-10-19'},{reviewDueDate:'2026-02-30'},{reviewer:''},{reviewDueDate:''}])assert.throws(()=>validateMilestone({...reviewedFields,...extra}),/review-fields/);
 assert.throws(()=>validateMilestone({...fields,reviewer:admin.email}),/review-fields/);
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='a'");await assert.rejects(f.act('save',owner,{fields:reviewedFields}),/review-admin/);
 await assert.rejects(f.act('save',admin,{fields:reviewedFields}),/assignee/);assert.equal((await readMilestones(f.db,'a')).milestones.length,0);
}finally{f.sqlite.close();}});
test('review cannot be approved by an unrelated admin and guards reviewer role, policy, assignment and revision at commit',async()=>{for(const mode of ['role','policy','disabled','assignment','revision']){const f=await fixture();try{
 f.sqlite.exec("INSERT INTO local_users VALUES('x','Other','other@example.com','Admin','Active')");
 await f.act('save',admin,{fields:reviewedFields});await f.act('submit');
 await assert.rejects(f.act('approve',{...admin,id:'x',email:'other@example.com'}),/independent-review/);
 const count=f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n;
 f.race(()=>{if(mode==='role')f.sqlite.exec("UPDATE local_users SET role='Viewer' WHERE id='a'");if(mode==='policy')f.sqlite.exec("INSERT INTO user_module_access VALUES('a','{\"mode\":\"scoped\",\"modules\":{}}')");if(mode==='disabled')f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='a'");if(mode==='assignment')f.sqlite.exec("UPDATE audit_milestones SET data_json=json_set(data_json,'$.reviewer','other@example.com'),revision='reassigned'");if(mode==='revision')f.sqlite.exec("UPDATE audit_milestones SET revision='concurrent'");});
 await assert.rejects(f.act('approve',admin),/conflict/);assert.equal((await f.row())?.status,'submitted');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,count);
}finally{f.sqlite.close();}}});
test('review queue hands off deadlines and recipients, invalidates old mail and returns ownership without leaking narrative',async()=>{const f=await fixture();try{
 await f.act('save',admin,{fields:reviewedFields});const now=new Date('2026-10-23T10:00Z');await syncMilestoneNotifications(f.db,now);const ownerNotice=queuedMilestones(f)[0];assert.equal(ownerNotice.recipient,owner.email);
 await f.act('submit');assert.equal(await milestoneNotificationCurrent(f.db,ownerNotice,now),false);await syncMilestoneNotifications(f.db,now);const notice=queuedMilestones(f)[0];assert.equal(notice.recipient,admin.email);assert.equal(notice.reason,'review-due');assert.ok(String(notice.body).includes('2026-10-23'));assert.ok(!String(notice.body).includes(fields.title));
 assert.equal(await milestoneNotificationCurrent(f.db,notice,now),true);
 let work=await readMilestoneWork(f.db,owner);assert.equal(work.milestones[0].dueAt,'2026-10-23T20:59:59.999Z');assert.equal(work.milestones[0].reviewer,admin.email);assert.equal('description' in work.milestones[0],false);
 let projection=projectEnterpriseWork('audit',{requests:[],...work});assert.equal(projection.complete,true);assert.equal(projection.rows[0].data.reviewer,admin.email);assert.equal(projection.rows[0].data.workClosed,false);
 await f.act('return',admin);assert.equal(await milestoneNotificationCurrent(f.db,notice,now),false);await syncMilestoneNotifications(f.db,now);assert.equal(queuedMilestones(f)[0].recipient,owner.email);
 work=await readMilestoneWork(f.db,owner);projection=projectEnterpriseWork('audit',{requests:[],...work});assert.equal(work.milestones[0].dueAt,'2026-10-20T20:59:59.999Z');assert.equal(projection.rows[0].data.reviewer,'');
 assert.equal(projectEnterpriseWork('audit',{requests:[],complete:true,milestones:[{...work.milestones[0],status:'submitted',reviewer:''}]}).complete,false);
}finally{f.sqlite.close();}});
test('pending review blocks dependent work and closure; approval/report snapshots retain exact independent decisions',async()=>{const f=await fixture();try{
 await f.act('save',admin,{fields:reviewedFields});await f.act('submit');await dependencyAct(f,secondId,'save',{fields:{...fields,dependsOn:[id]}});
 await assert.rejects(dependencyAct(f,secondId,'start'),/dependency-blocked/);const source=await readAuditReportSource(f.db,admin,'a');assert.ok(auditClosureBlockers(source).includes('milestones'));
 const reportId='ARP-'+crypto.randomUUID();await createAuditStatusReport(f.db,admin,{auditId:'a',reportId,expectedSourceRevision:source.sourceRevision,title:'Review pending',summary:'Independent milestone review pending',limitations:''});
 await f.act('approve',admin);await dependencyAct(f,secondId,'complete');assert.ok(!auditClosureBlockers(await readAuditReportSource(f.db,admin,'a')).includes('milestones'));await assert.rejects(f.act('reopen'),/dependency-blocked/);
 const saved=await readAuditStatusReport(f.db,admin,'a',reportId);assert.equal(saved.integrity,'verified');const item=saved.snapshot.items.find(i=>i.kind==='milestone'&&i.record.id===id)!;assert.equal(item.record.data.status,'submitted');assert.equal(item.record.data.reviewer,admin.email);assert.ok(auditStatusReportCsv(saved,false).includes('Submitted by'));
}finally{f.sqlite.close();}});
test('review decision failures roll back metadata, history, reminders and report revision; recovery handles disabled owners',async()=>{const f=await fixture();try{
 await f.act('save',admin,{fields:reviewedFields});await f.act('submit');await syncMilestoneNotifications(f.db,new Date('2026-10-23T10:00Z'));const before=(await f.row())!,notice=queuedMilestones(f)[0],source=f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision;
 f.sqlite.exec("CREATE TRIGGER fail_approval BEFORE INSERT ON audit_milestone_events WHEN NEW.action='approve' BEGIN SELECT RAISE(ABORT,'event-failed');END");await assert.rejects(f.act('approve',admin),/event-failed/);assert.deepEqual(await f.row(),before);assert.equal(queuedMilestones(f)[0].id,notice.id);assert.equal(f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision,source);f.sqlite.exec('DROP TRIGGER fail_approval');
 f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'");await assert.rejects(f.act('approve',admin),/assignee/);await f.act('return',admin);assert.equal((await f.row())?.status,'changes_requested');await f.act('cancel',admin);await f.act('reopen',admin);await f.act('save',admin,{fields:{...fields,owner:admin.email,reviewer:'',reviewDueDate:''}});assert.equal((await f.row())?.owner,admin.email);
}finally{f.sqlite.close();}});
test('recurrence copies required review and calendar-day offset but no approval; reopened reviewed work needs another approval',async()=>{const f=await fixture();try{
 await f.act('save',admin,{fields:{...reviewedFields,dueDate:'2026-01-31',reviewDueDate:'2026-02-03',recurrence:'monthly'}});await f.act('submit');await f.act('approve',admin);const result=await f.act('repeat');const child=(await readMilestones(f.db,'a')).milestones.find(m=>m.id===result.id)!;
 assert.equal(child.status,'planned');assert.equal(child.dueDate,'2026-02-28');assert.equal(child.reviewDueDate,'2026-03-03');assert.equal(child.reviewer,admin.email);assert.equal(child.reviewedBy,undefined);assert.equal(child.submittedBy,undefined);
 await assert.rejects(dependencyAct(f,child.id,'complete'),/review-required/);await f.act('reopen');await assert.rejects(dependencyAct(f,child.id,'submit'),/dependency-blocked/);
}finally{f.sqlite.close();}});


test('admin may explicitly remove a returned review with a reason and a readable active state',async()=>{const f=await fixture();try{
 await f.act('save',admin,{fields:reviewedFields});await f.act('submit');await f.act('return',admin);await f.act('save',admin,{fields:{...fields,reviewer:'',reviewDueDate:''}});assert.equal((await f.row())?.status,'in_progress');assert.equal((await f.row())?.reviewedBy,undefined);await f.act('complete');assert.equal((await f.row())?.status,'completed');
}finally{f.sqlite.close();}});
test('stored review without an independent submission or exact reviewer decision fails closed in reads and My Work',async()=>{for(const mode of ['submitter','reviewer','stamp']){const f=await fixture();try{
 await f.act('save',admin,{fields:reviewedFields});await f.act('submit');await f.act('approve',admin);
 f.sqlite.prepare("UPDATE audit_milestones SET data_json=json_set(data_json,?,?) WHERE id=?").run(mode==='submitter'?'$.submittedBy':mode==='reviewer'?'$.reviewedBy':'$.reviewedAt',mode==='submitter'?admin.email:mode==='reviewer'?owner.email:'invalid',id);
 await assert.rejects(f.row(),/source-invalid/);await assert.rejects(readMilestoneWork(f.db,owner),/source-invalid/);
}finally{f.sqlite.close();}}});

// Calendar-guided saves share the normal lifecycle transaction and authorization.
const adjustmentInput = { dueDate:'2026-10-24',reviewDueDate:'2026-10-25',timeZone:'Europe/Istanbul',profileRevision:'calendar-v1',reason:'Move deadlines past the approved holiday.' };
const adjustmentProfile = { ...defaultAuditReminderProfile,mode:'business',holidays:['2026-10-26'] };

test('milestones: explicit date adjustment records its exact calendar and retains normal inbox dates',async()=>{const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO audit_reminder_profiles VALUES(?,?,?,?,?)').run('a','calendar-v1',JSON.stringify(adjustmentProfile),'admin','');
 const adjusted={...fields,dueDate:'2026-10-27',reviewDueDate:'2026-10-27',timeZone:'Europe/Istanbul',reviewer:admin.email};
 await f.act('save',admin,{fields:adjusted,deadlineAdjustment:adjustmentInput});
 const row=await f.row();assert.equal(row?.dueDate,'2026-10-27');assert.equal(row?.reviewDueDate,'2026-10-27');
 const event=f.sqlite.prepare('SELECT snapshot_json FROM audit_milestone_events ORDER BY rowid DESC LIMIT 1').get();
 const proof=JSON.parse(String(event?.snapshot_json)).deadlineAdjustment;assert.equal(proof.before.dueDate,'2026-10-24');assert.equal(proof.after.dueDate,'2026-10-27');assert.equal(proof.profileRevision,'calendar-v1');assert.deepEqual(proof.calendar.holidays,['2026-10-26']);assert.equal(proof.reason,adjustmentInput.reason);
 const inbox=await readMilestoneWork(f.db,owner);assert.equal(inbox.milestones[0].dueAt,'2026-10-27T20:59:59.999Z');
 await assert.rejects(f.act('save',admin,{fields:{...adjusted,dueDate:'2026-10-28',reviewDueDate:'2026-10-28'},deadlineAdjustment:adjustmentInput}),/deadline-adjustment/);
 await assert.rejects(f.act('save',admin,{fields:adjusted,deadlineAdjustment:{...adjustmentInput,profileRevision:'stale'}}),/deadline-calendar-conflict/);
 assert.equal((await f.row())?.revision,row?.revision);
}finally{f.sqlite.close();}});
test('milestones: calendar revision/content/deletion races and event failures roll back dates, history and report revision',async()=>{for(const mode of ['revision','contents','deleted','event']){const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO audit_reminder_profiles VALUES(?,?,?,?,?)').run('a','calendar-v1',JSON.stringify(adjustmentProfile),'admin','');
 const original={...fields,dueDate:'2026-10-24',reviewDueDate:'2026-10-25',timeZone:'Europe/Istanbul',reviewer:admin.email};
 await f.act('save',admin,{fields:original});const before=await f.row();const source=f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision;
 if(mode==='event')f.sqlite.exec("CREATE TRIGGER fail_adjustment BEFORE INSERT ON audit_milestone_events BEGIN SELECT RAISE(ABORT,'injected');END");
 else f.race(()=>{if(mode==='revision')f.sqlite.exec("UPDATE audit_reminder_profiles SET revision='calendar-v2'");if(mode==='contents')f.sqlite.prepare('UPDATE audit_reminder_profiles SET data_json=?').run(JSON.stringify({...adjustmentProfile,holidays:[]}));if(mode==='deleted')f.sqlite.exec('DELETE FROM audit_reminder_profiles');});
 await assert.rejects(f.act('save',admin,{fields:{...original,dueDate:'2026-10-27',reviewDueDate:'2026-10-27'},deadlineAdjustment:adjustmentInput}),/conflict|injected/);
 assert.equal((await f.row())?.revision,before?.revision);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_milestone_events').get()?.n,1);assert.equal(f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision,source);
}finally{f.sqlite.close();}}});

test('milestone date planner cannot elevate an Editor to change the review deadline',async()=>{const f=await fixture();try{
 f.sqlite.prepare('INSERT INTO audit_reminder_profiles VALUES(?,?,?,?,?)').run('a','calendar-v1',JSON.stringify(adjustmentProfile),'admin','');
 const original={...fields,dueDate:'2026-10-24',reviewDueDate:'2026-10-25',timeZone:'Europe/Istanbul',reviewer:admin.email};
 await f.act('save',admin,{fields:original});const before=await f.row();
 await assert.rejects(f.act('save',owner,{fields:{...original,dueDate:'2026-10-27',reviewDueDate:'2026-10-27'},deadlineAdjustment:adjustmentInput}),/review-admin/);assert.equal((await f.row())?.revision,before?.revision);
}finally{f.sqlite.close();}});
