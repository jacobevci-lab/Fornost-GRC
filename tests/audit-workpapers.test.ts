import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Actor } from '../app/api/auth/security';
import { ensureAuditRequestSchema } from '../app/audit-request-store';
import { ensureEvidenceHistorySchema } from '../app/evidence/versioning';
import { ensureAuditClosureSchema } from '../app/audit-closure-schema';
import { auditClosureBlockers } from '../app/audit-closure';
import { readWorkpapers, readWorkpaperWork, mutateWorkpaper } from '../app/audit-workpaper-store';
import { readAuditReportSource, createAuditStatusReport, readAuditStatusReport } from '../app/audit-status-report-store';
import { auditWorkpaperSchema, auditWorkpaperSourceTriggers, auditWorkpaperClosureGuards } from '../app/audit-workpaper-schema';
import { emptyWorkpaper, validateWorkpaper, requireWorkpaperComplete, type WorkpaperFields } from '../app/audit-workpapers';
const owner: Actor = { id:'o', email:'owner@example.com', name:'Owner', role:'Editor', source:'local' };
const reviewer: Actor = { ...owner, id:'r', email:'reviewer@example.com' };
const admin: Actor = { ...owner, id:'a', email:'admin@example.com', role:'Admin' };
const now = new Date('2026-10-19T12:00:00Z');
const fields: WorkpaperFields = { ...emptyWorkpaper, title:'Privileged access sampling', objective:'Verify access approvals', procedure:'Compare requests and approval evidence', population:'Q3 privileged accounts from the IAM export', populationCount:10, rationale:'Select high privilege accounts', conclusion:'Selected account has documented approval', owner:owner.email, reviewer:reviewer.email, samples:[{reference:'Account-001',result:'pass',note:'Approval found and dated before access',versionId:'EVV-one'}] };
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT); INSERT INTO simple_audits VALUES('audit-a','Audit A'),('audit-b','Audit B'); CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT); CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);
    INSERT INTO local_users VALUES('o','Owner','owner@example.com','Editor','Active'),('r','Reviewer','reviewer@example.com','Editor','Active'),('a','Admin','admin@example.com','Admin','Active');
    CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT); INSERT INTO simple_grc_records VALUES('EVD-a','Kanıtlar','{}','','');`);
  function prepare(sql: string, args: SQLInputValue[] = []) {
    return { bind(...values: SQLInputValue[]) { return prepare(sql, values); },
      execute() { const results = sqlite.prepare(sql).all(...args); return { results, success: true, meta: { changes: Number((sqlite.prepare('SELECT changes() n').get() as { n: number }).n) } }; },
      async all() { return this.execute(); }, async run() { return this.execute(); }, async first() { return sqlite.prepare(sql).get(...args) || null; } };
  }
  let beforeBatch: (() => void) | undefined, beforeBatchDelay = 0;
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { const hook = beforeBatchDelay > 0 ? undefined : beforeBatch; if (beforeBatchDelay > 0) beforeBatchDelay--; else beforeBatch = undefined; hook?.(); sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  await ensureAuditRequestSchema(db); await ensureEvidenceHistorySchema(db);
  sqlite.prepare(`INSERT INTO evidence_versions(id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('EVV-one','EVD-a',1,'evidence/EVD-a/v1.pdf','v1.pdf','application/pdf',100,'a'.repeat(64),'b'.repeat(64),'Access review',owner.email,'Q3 2026','','CTRL-1','Initial',owner.email,now.toISOString());
  await ensureAuditClosureSchema(db);
  const row = async () => (await readWorkpapers(db, 'audit-a')).papers.find(p => p.id === 'AWP-a')!;
  const act = async (action: string, who = owner, extra = {}) => mutateWorkpaper(db, who, { auditId: 'audit-a', id: 'AWP-a', action, expectedRevision: (await row())?.revision || '', note: 'Reviewed the documented test evidence.', ...extra }, now);
  return { db, sqlite, row, act, race: (hook: () => void) => { beforeBatch = hook; } };
}

test('sampling validates unique units, population bounds, independence and complete census', () => {
 for (const patch of [{populationCount:0},{populationCount:1.5},{reviewer:owner.email},{samples:[fields.samples[0],fields.samples[0]]},{samples:[{...fields.samples[0],reference:''}]}]) assert.throws(()=>validateWorkpaper({...fields,...patch}));
 assert.throws(()=>requireWorkpaperComplete({...fields,method:'census'}),/incomplete/);
 assert.throws(()=>requireWorkpaperComplete({...fields,conclusion:''}),/incomplete/);
 assert.throws(()=>requireWorkpaperComplete({...fields,samples:[{...fields.samples[0],result:'pending'}]}),/incomplete/);
 requireWorkpaperComplete({...fields,method:'census',populationCount:1});
});
test('owner submission, independent return and approval, pinned evidence, reopen and cancellation retain sample history', async()=>{
 const f=await fixture();try{
  await f.act('save',owner,{fields});assert.equal((await f.row()).status,'draft');
  await assert.rejects(f.act('save',reviewer,{fields}),/owner/);
  await assert.rejects(f.act('submit',admin),/owner/);await f.act('submit');
  await assert.rejects(f.act('approve'),/independent-review/);await assert.rejects(f.act('approve',admin),/independent-review/);
  await f.act('return',reviewer);await f.act('save',owner,{fields:{...fields,samples:[{...fields.samples[0],result:'exception',note:'Approval missing the required second approver'}]}});
  await f.act('submit');await f.act('approve',reviewer);assert.equal((await f.row()).status,'approved');
  await assert.rejects(f.act('save',owner,{fields}),/transition/);await f.act('reopen');await f.act('cancel');
  assert.equal((await f.row()).status,'cancelled');await assert.rejects(f.act('reopen'),/transition/);
  const events=f.sqlite.prepare('SELECT action,snapshot_json FROM audit_workpaper_events ORDER BY rowid').all();
  assert.deepEqual(events.map(e=>e.action),['save','submit','return','save','submit','approve','reopen','cancel']);
  assert.equal(JSON.parse(String(events[0].snapshot_json)).samples[0].result,'pass');assert.equal(JSON.parse(String(events[5].snapshot_json)).samples[0].result,'exception');
  assert.equal(JSON.parse(String(events[5].snapshot_json)).evidence[0].contentSha256,'a'.repeat(64));
 }finally{f.sqlite.close();}
});
test('stale edits, cross-audit identifiers, missing evidence, viewers and author-as-reviewer do not overwrite',async()=>{
 const f=await fixture();try{
  await f.act('save',owner,{fields});const initial=await f.row();
  await assert.rejects(f.act('save',{...owner,role:'Viewer'},{fields}),/forbidden/);
  await assert.rejects(f.act('save',owner,{fields,expectedRevision:''}),/conflict/);
  await assert.rejects(f.act('save',owner,{fields,auditId:'audit-b',expectedRevision:''}),/conflict/);
  await assert.rejects(f.act('save',owner,{fields:{...fields,samples:[{...fields.samples[0],versionId:'missing'}]}}),/evidence/);
  assert.equal((await f.row()).revision,initial.revision);
  await f.act('save',admin,{fields:{...fields,owner:reviewer.email,reviewer:owner.email}});
  await f.act('submit',reviewer);await assert.rejects(f.act('approve',owner),/independent-review/);
 }finally{f.sqlite.close();}
});
test('commit-time source, evidence and account races fail atomically; event failure rolls back content',async()=>{
 for(const sql of ["UPDATE local_users SET status='Inactive' WHERE id='r'", "UPDATE evidence_versions SET content_sha256='changed' WHERE id='EVV-one'", "DELETE FROM simple_audits WHERE id='audit-a'", "UPDATE audit_workpapers SET revision='concurrent' WHERE id='AWP-a'"]){
  const f=await fixture();try{await f.act('save',owner,{fields});const before=f.sqlite.prepare('SELECT count(*) n FROM audit_workpaper_events').get()?.n;f.race(()=>f.sqlite.exec(sql));await assert.rejects(f.act('submit'),/conflict/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_workpaper_events').get()?.n,before);}finally{f.sqlite.close();}
 }
 const f=await fixture();try{f.sqlite.exec("CREATE TRIGGER reject_event BEFORE INSERT ON audit_workpaper_events BEGIN SELECT RAISE(ABORT,'injected'); END");await assert.rejects(f.act('save',owner,{fields}),/injected/);assert.equal((await readWorkpapers(f.db,'audit-a')).papers.length,0);}finally{f.sqlite.close();}
});
test('workpapers enter saved reports, invalidate source tokens, block closure and obey closed-audit SQL guards',async()=>{
 const f=await fixture();try{
  const before=await readAuditReportSource(f.db,admin,'audit-a');await f.act('save',owner,{fields});
  const source=await readAuditReportSource(f.db,admin,'audit-a');assert.notEqual(source.sourceRevision,before.sourceRevision);assert.ok(auditClosureBlockers(source).includes('workpapers'));
  const saved=await createAuditStatusReport(f.db,admin,{auditId:'audit-a',reportId:`ARP-${crypto.randomUUID()}`,expectedSourceRevision:source.sourceRevision,title:'Sampling report',summary:'This snapshot includes the selected test units.',limitations:''});
  await f.act('submit');await f.act('approve',reviewer);assert.ok(!auditClosureBlockers(await readAuditReportSource(f.db,admin,'audit-a')).includes('workpapers'));
  const report=await readAuditStatusReport(f.db,admin,'audit-a',saved.id);assert.equal(report.integrity,'verified');assert.equal(report.snapshot.items.find(i=>i.kind==='workpaper')?.record.data.status,'draft');
  f.sqlite.exec("INSERT INTO audit_closure_state VALUES('audit-a','closed','r','','')");
  await assert.rejects(f.act('reopen'),/audit-closed/);
  assert.throws(()=>f.sqlite.exec("DELETE FROM audit_workpapers WHERE id='AWP-a'"),/audit-closed/);
  assert.throws(()=>f.sqlite.exec("UPDATE audit_workpapers SET audit_id='audit-b' WHERE id='AWP-a'"),/audit-closed/);
 }finally{f.sqlite.close();}
});
test('migration matches incremental runtime schema and guards',()=>{
 assert.equal(readFileSync('drizzle/0093_audit_workpapers.sql','utf8'),[...auditWorkpaperSchema,...auditWorkpaperSourceTriggers,...auditWorkpaperClosureGuards].join(';\n\n')+';\n');
});

test('inactive assignees or removed evidence do not trap work in review; recovery retains the original snapshot',async()=>{
 const f=await fixture();try{
  await f.act('save',owner,{fields});await f.act('submit');
  f.sqlite.exec("UPDATE local_users SET status='Inactive' WHERE id='r'; DELETE FROM evidence_versions WHERE id='EVV-one'");
  await f.act('withdraw');assert.equal((await f.row()).status,'draft');assert.equal((await f.row()).evidence[0].id,'EVV-one');
  await f.act('cancel',admin);assert.equal((await f.row()).status,'cancelled');
 }finally{f.sqlite.close();}
});


test('inbox projects current lifecycle without evidence, excludes orphan parents, and enforces both module grants', async () => {
 const f = await fixture(); try {
  await f.act('save', owner, { fields });
  const work = await readWorkpaperWork(f.db, owner);
  assert.equal(work.complete, true); assert.equal(work.workpapers.length, 1);
  assert.deepEqual(Object.keys(work.workpapers[0]).sort(), ['id','auditId','title','status','owner','reviewer','createdAt','updatedAt'].sort());
  assert.equal(work.workpapers[0].status, 'draft');
  await f.act('submit'); assert.equal((await readWorkpaperWork(f.db, reviewer)).workpapers[0].status, 'submitted');
  await f.act('return', reviewer); assert.equal((await readWorkpaperWork(f.db, owner)).workpapers[0].status, 'draft');
  await f.act('submit'); await f.act('approve', reviewer); assert.equal((await readWorkpaperWork(f.db, owner)).workpapers[0].status, 'approved');
  await f.act('reopen'); await f.act('cancel'); assert.equal((await readWorkpaperWork(f.db, owner)).workpapers[0].status, 'cancelled');
  for (const modules of [{}, {'Denetim Yönetimi':'read'}, {'Kanıtlar':'read'}] as const) {
   assert.deepEqual(await readWorkpaperWork(f.db, {...owner, moduleAccess:{mode:'scoped',modules}}), {workpapers:[],complete:true});
  }
  assert.equal((await readWorkpaperWork(f.db, {...owner,moduleAccess:{mode:'scoped',modules:{'Denetim Yönetimi':'read','Kanıtlar':'read'}}})).workpapers.length,1);
  f.sqlite.exec("DELETE FROM simple_audits WHERE id='audit-a'");
  assert.equal((await readWorkpaperWork(f.db,owner)).workpapers.length,0);
 } finally { f.sqlite.close(); }
});

test('inbox bounds do not claim complete when more than 1000 papers exist', async () => {
 const f=await fixture();try{
  // Simulate many engagements without bypassing the per-engagement write limit in normal operation.
  const insert=f.sqlite.prepare('INSERT INTO audit_workpapers VALUES(?,?,?,?,?,?)');
  for(let i=0;i<1001;i++) insert.run(`bulk-${i}`,'audit-a',`r-${i}`,JSON.stringify({...fields,status:'draft'}),'','');
  const work=await readWorkpaperWork(f.db,owner);assert.equal(work.workpapers.length,1000);assert.equal(work.complete,false);
 }finally{f.sqlite.close();}
});
