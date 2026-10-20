import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import type {Actor} from '../app/api/auth/security';
import {ensureAuditClosureSchema} from '../app/audit-closure-schema';
import {auditClosureBlockers} from '../app/audit-closure';
import {mutateMilestone,readMilestones,readMilestoneWork} from '../app/audit-milestone-store';
import {resolveRecordLink} from '../app/record-link-store';
import {validateMilestone} from '../app/audit-milestones';
import {requestDueAt} from '../app/audit-requests';
import {projectEnterpriseWork} from '../app/enterprise-work';
import {readAuditReportSource,createAuditStatusReport,readAuditStatusReport} from '../app/audit-status-report-store';
import {auditStatusReportCsv} from '../app/audit-status-report-export';
import {scopedApiAllowed} from '../app/module-access';
const owner:Actor={id:'o',name:'Owner',email:'owner@example.com',role:'Editor',source:'local'},admin:Actor={...owner,id:'a',email:'admin@example.com',role:'Admin'};
const id='AMT-00000000-0000-0000-0000-000000000001',fields={title:'Planning meeting',description:'Agree scope and review dates',owner:owner.email,dueDate:'2026-10-20',timeZone:'Europe/Istanbul'};
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT,template TEXT,audit_type TEXT,auditor TEXT,audit_owner TEXT,status TEXT);INSERT INTO simple_audits VALUES('a','Audit A','','','','',''),('b','Audit B','','','','','');CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);INSERT INTO local_users VALUES('o','Owner','owner@example.com','Editor','Active'),('a','Admin','admin@example.com','Admin','Active');`);
 function prepare(sql:string,args:SQLInputValue[]=[]){return{bind(...v:SQLInputValue[]){return prepare(sql,v);},execute(){return{results:sqlite.prepare(sql).all(...args),success:true,meta:{changes:1}};},async all(){return this.execute();},async run(){return this.execute();},async first(){return sqlite.prepare(sql).get(...args)||null;}};}
 let hook:(()=>void)|undefined;
 const db={prepare,async batch(stmts:ReturnType<typeof prepare>[]){const next=hook;hook=undefined;next?.();sqlite.exec('BEGIN');try{const result=stmts.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 await ensureAuditClosureSchema(db);
 const row=async()=>(await readMilestones(db,'a')).milestones.find(m=>m.id===id);
 const act=async(action:string,actor=owner,extra:Record<string,unknown>={})=>mutateMilestone(db,actor,{auditId:'a',id,action,expectedRevision:(await row())?.revision||'',fields,note:'Documented outcome or reason',...extra},new Date('2026-10-20T10:00:00Z'));
 return{db,sqlite,row,act,race:(f:()=>void)=>{hook=f;}};
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
