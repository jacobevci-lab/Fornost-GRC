import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import type {Actor} from '../app/api/auth/security';
import {ensureAuditRequestSchema} from '../app/audit-request-store';
import {ensureEvidenceHistorySchema} from '../app/evidence/versioning';
import {ensureAuditClosureSchema} from '../app/audit-closure-schema';
import {emptyWorkpaper,type WorkpaperFields} from '../app/audit-workpapers';
import {readWorkpapers,mutateWorkpaper} from '../app/audit-workpaper-store';
import {createWorkpaperCapa,readWorkpaperCapa,readWorkpaperCapaOrigin} from '../app/workpaper-capa-store';
import {workpaperCapaSchema} from '../app/workpaper-capa-schema';
import {readAuditReportSource,createAuditStatusReport,readAuditStatusReport} from '../app/audit-status-report-store';
import {auditClosureBlockers} from '../app/audit-closure';
import {auditStatusReportView} from '../app/audit-status-report-export';
const owner: Actor = { id:'o', email:'owner@example.com', name:'Owner', role:'Editor', source:'local' };
const reviewer: Actor = { ...owner, id:'r', email:'reviewer@example.com' };
const admin: Actor = { ...owner, id:'a', email:'admin@example.com', role:'Admin' };
const now = new Date('2026-10-19T12:00:00Z');
const fields: WorkpaperFields = { ...emptyWorkpaper, title:'Privileged access sampling', objective:'Verify access approvals', procedure:'Compare requests and approval evidence', population:'Q3 privileged accounts from the IAM export', populationCount:10, rationale:'Select high privilege accounts', conclusion:'Approval control failed for the selected account', owner:owner.email, reviewer:reviewer.email, samples:[{reference:'Account-001',result:'exception',note:'Required independent approval was missing for privileged access',versionId:'EVV-one'}] };
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

const plan={findingType:'nonconformity',title:'Missing privileged account approval',description:'The selected account lacks the required independent approval record.',severity:'medium',owner:owner.email,reviewer:admin.email,rootCause:'Provisioning did not enforce independent approval.',correctiveAction:'Review the affected account and remove unapproved privileges.',preventiveAction:'Enforce approval checks before any privileged access is provisioned.',dueDate:'2026-11-01',riskRef:'',controlRef:''};
async function approved(){const f=await fixture();await f.act('save',owner,{fields});await f.act('submit');await f.act('approve',reviewer);return f;}
async function input(f:Awaited<ReturnType<typeof fixture>>){return{auditId:'audit-a',workpaperId:'AWP-a',findingId:`FND-${crypto.randomUUID()}`,expectedRevision:(await f.row()).revision,reference:'Account-001',reason:'Track corrective action for this independently reviewed exception.',fields:plan};}

test('approved exception creates one canonical open CAPA with immutable origin and independent remediation evidence',async()=>{
 const f=await approved();try{
  const before=await f.row(),payload=await input(f),created=await createWorkpaperCapa(f.db,owner,payload,now);
  const finding=f.sqlite.prepare('SELECT * FROM enterprise_findings WHERE id=?').get(created.id)!;
  assert.equal(finding.source_type,'audit');assert.equal(finding.source_ref,'audit-a');assert.equal(finding.status,'open');assert.equal(finding.evidence_reference,null);assert.equal(finding.evidence_sha256,null);
  assert.deepEqual(await f.row(),before,'Promotion never edits independently approved content');
  const read=await readWorkpaperCapa(f.db,owner,'audit-a','AWP-a');assert.equal(read.links.length,1);assert.equal(read.links[0].origin.evidence.contentSha256,'a'.repeat(64));assert.equal(read.links[0].sourceRevision,before.revision);
  assert.equal((await readWorkpaperCapaOrigin(f.db,admin,created.id)).sourceAvailable,true);
  assert.equal((await readWorkpaperCapaOrigin(f.db,admin,'unrelated')).link,null);
  assert.deepEqual(await createWorkpaperCapa(f.db,owner,payload,now),{...created,reused:true});
  await assert.rejects(createWorkpaperCapa(f.db,owner,{...payload,findingId:`FND-${crypto.randomUUID()}`},now),/already-linked/);
  await assert.rejects(createWorkpaperCapa(f.db,owner,{...payload,reason:'Different intent'},now),/already-linked/);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_finding_events').get()?.n,1);
  assert.throws(()=>f.sqlite.exec("UPDATE audit_workpaper_capa_links SET origin_json='{}'"),/immutable-workpaper-capa/);
  assert.throws(()=>f.sqlite.exec('DELETE FROM audit_workpaper_capa_links'),/immutable-workpaper-capa/);
  await f.act('reopen');await f.act('save',owner,{fields:{...fields,samples:[{...fields.samples[0],result:'pass',note:'A later test succeeded'}]}});
  assert.equal((await readWorkpaperCapa(f.db,admin,'audit-a','AWP-a')).links[0].origin.sample.result,'exception');
  f.sqlite.exec("DELETE FROM simple_audits WHERE id='audit-a'");
  assert.equal((await readWorkpaperCapaOrigin(f.db,admin,created.id)).sourceAvailable,false);
  assert.equal((await readWorkpaperCapaOrigin(f.db,admin,created.id)).link?.origin.sample.result,'exception');
 }finally{f.sqlite.close();}
});

test('draft, submitted, non-exception, stale, cross-audit, scoped and unassigned writers cannot promote',async()=>{
 const f=await fixture();try{
  await f.act('save',owner,{fields});await assert.rejects(createWorkpaperCapa(f.db,owner,await input(f),now),/approved-required/);
  await f.act('submit');await assert.rejects(createWorkpaperCapa(f.db,owner,await input(f),now),/approved-required/);await f.act('approve',reviewer);
  const payload=await input(f);
  for(const [patch,pattern] of [[{auditId:'audit-b'},/missing/],[{expectedRevision:'stale'},/conflict/],[{reference:'missing'},/exception-required/],[{reason:'x'},/fields/],[{fields:{...plan,sourceRef:'spoof'}},/fields/],[{fields:{...plan,reviewer:owner.email}},/capa-fields/],[{fields:{...plan,reviewer:reviewer.email}},/assignee/]] as const)await assert.rejects(createWorkpaperCapa(f.db,owner,{...payload,...patch},now),pattern);
  await assert.rejects(createWorkpaperCapa(f.db,{...owner,role:'Viewer'},payload,now),/forbidden/);
  await assert.rejects(createWorkpaperCapa(f.db,admin,payload,now),/independent-review/);
  f.sqlite.exec("INSERT INTO local_users VALUES('x','Other','other@example.com','Editor','Active')");
  await assert.rejects(createWorkpaperCapa(f.db,{...owner,id:'x',email:'other@example.com'},payload,now),/owner/);
  const scoped={...owner,moduleAccess:{mode:'scoped' as const,modules:{'Denetim Yönetimi':'write' as const,'Kanıtlar':'read' as const}}};
  await assert.rejects(createWorkpaperCapa(f.db,scoped,payload,now),/forbidden/);await assert.rejects(readWorkpaperCapa(f.db,scoped,'audit-a','AWP-a'),/forbidden/);
  f.sqlite.exec("INSERT INTO user_module_access VALUES('o','{\"mode\":\"scoped\",\"modules\":{\"Denetim Yönetimi\":\"write\",\"Kanıtlar\":\"read\"}}')");
  await assert.rejects(createWorkpaperCapa(f.db,owner,payload,now),/forbidden/);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,0);
 }finally{f.sqlite.close();}
 const g=await fixture();try{await g.act('save',owner,{fields:{...fields,samples:[{...fields.samples[0],result:'pass'}]}});await g.act('submit');await g.act('approve',reviewer);await assert.rejects(createWorkpaperCapa(g.db,owner,await input(g),now),/exception-required/);}finally{g.sqlite.close();}
});

test('commit-time account, policy, source, closure and pinned evidence races produce no partial CAPA',async()=>{
 const races=["UPDATE local_users SET status='Inactive' WHERE id='o'","UPDATE local_users SET role='Viewer' WHERE id='o'","UPDATE local_users SET email='changed@example.com' WHERE id='o'","INSERT INTO user_module_access VALUES('o','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE local_users SET status='Inactive' WHERE id='a'","UPDATE local_users SET role='Editor' WHERE id='a'","UPDATE audit_workpapers SET revision='concurrent' WHERE id='AWP-a'","UPDATE simple_audits SET name='Changed audit' WHERE id='audit-a'","DELETE FROM simple_audits WHERE id='audit-a'","INSERT INTO audit_closure_state VALUES('audit-a','closed','c','','')","UPDATE evidence_versions SET content_sha256='changed' WHERE id='EVV-one'","DELETE FROM simple_grc_records WHERE id='EVD-a'"];
 for(const sql of races){const f=await approved();try{const payload=await input(f);f.race(()=>f.sqlite.exec(sql));await assert.rejects(createWorkpaperCapa(f.db,owner,payload,now),/conflict|audit-closed/);for(const table of ['enterprise_findings','enterprise_finding_events','audit_workpaper_capa_links'])assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()?.n,0,sql);}finally{f.sqlite.close();}}
});

test('link or lifecycle history failure rolls back the finding; removed canonical references reject intake',async()=>{
 for(const table of ['audit_workpaper_capa_links','enterprise_finding_events']){const f=await approved();try{f.sqlite.exec(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected'); END`);await assert.rejects(createWorkpaperCapa(f.db,owner,await input(f),now),/injected/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_workpaper_capa_links').get()?.n,0);}finally{f.sqlite.close();}}
 const f=await approved();try{await assert.rejects(createWorkpaperCapa(f.db,owner,{...await input(f),fields:{...plan,riskRef:'RSK-999'}},now),/conflict/);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,0);}finally{f.sqlite.close();}
});

test('CAPA origin enters immutable audit snapshots and exports while preserving the existing owner/deadline closure policy',async()=>{
 const f=await approved();try{
  const before=await readAuditReportSource(f.db,admin,'audit-a'),payload=await input(f);await createWorkpaperCapa(f.db,owner,payload,now);
  const source=await readAuditReportSource(f.db,admin,'audit-a');assert.notEqual(source.sourceRevision,before.sourceRevision);assert.ok(!auditClosureBlockers(source).includes('findings'));
  const item=source.items.find(i=>i.kind==='finding')!;assert.equal((item.record.data.workpaperOrigin as {revision:string}).revision,payload.expectedRevision);
  const saved=await createAuditStatusReport(f.db,admin,{auditId:'audit-a',reportId:`ARP-${crypto.randomUUID()}`,expectedSourceRevision:source.sourceRevision,title:'Exception follow-up',summary:'Source sample and action plan are preserved in this report.',limitations:''},now);
  await f.act('reopen');await f.act('cancel');
  const report=await readAuditStatusReport(f.db,admin,'audit-a',saved.id);assert.equal(report.integrity,'verified');assert.equal((report.snapshot.items.find(i=>i.kind==='finding')!.record.data.workpaperOrigin as {sample:{result:string}}).sample.result,'exception');
  for(const tr of [true,false]){const view=auditStatusReportView(report,tr);assert.match(JSON.stringify(view),/Account-001/);assert.match(JSON.stringify(view),new RegExp('a'.repeat(64)));}
  item.record.data.owner='';assert.ok(auditClosureBlockers(source).includes('findings'));
 }finally{f.sqlite.close();}
});

test('full-access Viewers can inspect links without creating, and read-time revocation exposes no stale origin',async()=>{
 const f=await approved();try{
  const created=await createWorkpaperCapa(f.db,owner,await input(f),now);
  f.sqlite.exec("INSERT INTO local_users VALUES('v','Viewer','viewer@example.com','Viewer','Active')");const viewer:Actor={...owner,id:'v',email:'viewer@example.com',role:'Viewer'};
  const read=await readWorkpaperCapa(f.db,viewer,'audit-a','AWP-a');assert.equal(read.links.length,1);assert.equal(read.canCreate,false);assert.deepEqual(read.people,[]);
  assert.equal((await readWorkpaperCapaOrigin(f.db,viewer,created.id)).link?.findingId,created.id);
  f.race(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='v'"));await assert.rejects(readWorkpaperCapaOrigin(f.db,viewer,created.id),/forbidden/);
  await assert.rejects(readWorkpaperCapa(f.db,viewer,'audit-a','AWP-a'),/forbidden/);
 }finally{f.sqlite.close();}
});

test('workpaper CAPA migration equals the incremental schema',()=>{assert.equal(readFileSync('drizzle/0095_workpaper_capa.sql','utf8'),workpaperCapaSchema.join(';\n\n')+';\n');});

test('competing administrators create a single finding and case changes after reopening cannot duplicate a sample',async()=>{
 const f=await approved();try{
  f.sqlite.exec("INSERT INTO local_users VALUES('a2','Other Admin','review-admin@example.com','Admin','Active')");
  const payload={...await input(f),fields:{...plan,reviewer:'review-admin@example.com'}},other={...payload,findingId:`FND-${crypto.randomUUID()}`};
  const results=await Promise.allSettled([createWorkpaperCapa(f.db,owner,payload,now),createWorkpaperCapa(f.db,admin,other,now)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enterprise_finding_events').get()?.n,1);
  await f.act('reopen');await f.act('save',owner,{fields:{...fields,samples:[{...fields.samples[0],reference:'account-001'}]}});await f.act('submit');await f.act('approve',reviewer);
  await assert.rejects(createWorkpaperCapa(f.db,owner,{...await input(f),reference:'account-001'},now),/already-linked/);
 }finally{f.sqlite.close();}
});

test('lifetime promotion limits are explicit and deleted CAPA never silently resurrects',async()=>{
 const f=await approved();try{
  const payload=await input(f),created=await createWorkpaperCapa(f.db,owner,payload,now);
  f.sqlite.prepare('DELETE FROM enterprise_findings WHERE id=?').run(created.id);
  assert.equal((await readWorkpaperCapa(f.db,admin,'audit-a','AWP-a')).links[0].missing,true);
  await assert.rejects(createWorkpaperCapa(f.db,owner,payload,now),/already-linked/);
 }finally{f.sqlite.close();}
 const g=await approved();try{
  for(let n=0;n<100;n++)g.sqlite.prepare('INSERT INTO audit_workpaper_capa_links VALUES(?,?,?,?,?,?,?,?,?)').run(`old-${n}`,'audit-a','AWP-a',`old-sample-${n}`,'old-revision','hash',JSON.stringify({sample:{reference:`old-sample-${n}`}}),admin.email,now.toISOString());
  const read=await readWorkpaperCapa(g.db,admin,'audit-a','AWP-a');assert.equal(read.links.length,100);assert.equal(read.complete,true);
  await assert.rejects(createWorkpaperCapa(g.db,owner,await input(g),now),/conflict/);assert.equal(g.sqlite.prepare('SELECT count(*) n FROM enterprise_findings').get()?.n,0);
 }finally{g.sqlite.close();}
});
