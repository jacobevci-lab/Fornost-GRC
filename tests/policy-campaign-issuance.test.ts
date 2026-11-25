import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';

const actor = { id: 'issuer', email: 'issuer@example.com', name: 'Issuer', role: 'Admin' as const, source: 'local' as const };
const stamp = '2020-01-01T12:00:00.000Z', content = 'This published policy governs individual access responsibilities, information protection and explicit acknowledgement of the issued obligations.';
const digest = createHash('sha256').update(content).digest('hex');
const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const requestId = 'PAC-00000000-0000-4000-8000-000000000001';
async function setup() {
  const f = fixture('policy-lifecycle'); await f.post({});
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  for (const row of [[actor.id,actor.name,actor.email,actor.role,'Active'],['reader','Reader','reader@example.com','Viewer','Active'],['writer','Writer','writer@example.com','Editor','Active'],['disabled','Disabled','disabled@example.com','Viewer','Disabled'],['scoped','Scoped','scoped@example.com','Viewer','Active']]) f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(...row);
  f.sqlite.exec("INSERT INTO user_module_access VALUES('scoped','{\"mode\":\"scoped\",\"modules\":{\"Kontroller\":\"read\"}}')");
  const policy = { id: 'POL-1', code: 'POL-001', title: 'Controlled issued policy', category: 'security', classification: 'internal', owner: 'owner@example.com', reviewer: 'reviewer@example.com', audience: 'Employees', review_frequency_days: 365, status: 'published', current_version_id: 'PV-1', next_review: '2030-01-01', created_by: 'creator@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  const version = { id: 'PV-1', policy_id: 'POL-1', version_number: 1, summary: 'The original controlled policy for employees.', content, content_sha256: digest, control_refs_json: '["CTRL-1"]', regulation_refs_json: '[]', risk_refs_json: '[]', effective_date: '2020-01-01', status: 'published', created_by: 'writer@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  for (const [table, row] of [['policy_documents', policy], ['policy_versions', version]] as const) f.sqlite.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  f.setActor(actor); return f;
}
const input = (patch: Record<string,unknown> = {}) => ({ policyId:'POL-1', name:'Annual issued policy', audience:'Selected employees', dueDate:future(), subjectIds:['writer','reader'], ...patch });
const preview = (f: ReturnType<typeof fixture>, patch: Record<string,unknown> = {}) => f.post({ action:'preview-campaign', ...input(patch) });
const request = async (f: ReturnType<typeof fixture>, patch: Record<string,unknown> = {}) => ({ action:'create-campaign',issueMode:'directory-reviewed',requestId,expectedRevision:(await preview(f,patch)).body.revision,confirmation:'ISSUE POLICY CAMPAIGN',...input(patch) });
const count = (f: ReturnType<typeof fixture>, table = 'policy_attestation_campaigns') => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
function empty(f:ReturnType<typeof fixture>) { for(const table of ['policy_attestation_campaigns','policy_attestations','policy_events'])assert.equal(count(f,table),0,table); }

test('preview is read-only, shows the exact current version and includes eligible full-access Viewers', async()=>{
  const f=await setup();try{const result=await preview(f);assert.equal(result.status,200);assert.equal((result.body.version as {content:string}).content,content);assert.equal((result.body.version as {id:string}).id,'PV-1');assert.match(String(result.body.revision),/^[a-f0-9]{64}$/);const people=result.body.participants as Record<string,unknown>[];assert.deepEqual(people.map(p=>p.id),['reader','writer']);assert.ok(people.every(p=>!('policy_json' in p)&&!('status' in p)));empty(f);}finally{f.sqlite.close();}
});
test('Admin directory lookup searches and pages bounded accounts, excludes disabled/scoped/corrupt-policy accounts and handles an empty eligible page', async()=>{
  const f=await setup();try{let data=(await f.get('view=campaign-people')).body;assert.deepEqual((data.people as {id:string}[]).map(p=>p.id),['issuer','reader','writer']);assert.equal(data.hasMore,false);
    assert.equal(((await f.get('view=campaign-people&q=READER%40')).body.people as unknown[]).length,1);
    f.sqlite.exec("INSERT INTO user_module_access VALUES('writer','broken')");assert.equal(((await f.get('view=campaign-people&q=writer')).body.people as unknown[]).length,0);
    for(let i=0;i<55;i++){const id=`batch-${String(i).padStart(3,'0')}`;f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,'Batch '+id,id+'@example.com','Viewer','Active');if(i<50)f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run(id,'{"mode":"scoped","modules":{}}');}
    data=(await f.get('view=campaign-people&q=Batch')).body;assert.equal(data.hasMore,true);assert.equal((data.people as unknown[]).length,0);data=(await f.get('view=campaign-people&q=Batch&page=1')).body;assert.equal(data.hasMore,false);assert.equal((data.people as unknown[]).length,5);
    for(const query of ['page=-1','page=1.2','page=10001','page=0&page=1','q=x&q=y',`q=${'x'.repeat(161)}`])assert.equal((await f.get('view=campaign-people&'+query)).status,400);empty(f);
  }finally{f.sqlite.close();}
});
test('reviewed creation atomically produces canonical assignments, creation proof and existing My Work tasks', async()=>{
  const f=await setup();try{const result=await f.post(await request(f));assert.equal(result.status,200);assert.equal(result.body.id,requestId);assert.equal(result.body.replay,false);assert.equal(count(f),1);assert.equal(count(f,'policy_attestations'),2);assert.equal(count(f,'policy_events'),1);const campaign=f.sqlite.prepare('SELECT * FROM policy_attestation_campaigns').get()!;assert.equal(campaign.version_id,'PV-1');assert.equal(campaign.required_count,2);assert.equal(campaign.created_by,actor.email);
    const detail=JSON.parse(String(f.sqlite.prepare('SELECT detail FROM policy_events').get()!.detail));assert.equal(detail.contentSha256,digest);assert.equal(detail.actorId,actor.id);assert.equal(detail.kind,'directory-reviewed-campaign');assert.deepEqual(detail.participants.map((p:{email:string})=>p.email),['reader@example.com','writer@example.com']);assert.equal(detail.participants[0].name,'Reader');
    const work=projectEnterpriseWork('policy',(await f.get()).body);assert.equal(work.complete,true);assert.equal(work.rows.filter(r=>r.workKind==='policy-attestation').length,2);assert.ok(work.rows.filter(r=>r.workKind==='policy-attestation').every(r=>r.data.status==='pending'));
  }finally{f.sqlite.close();}
});
test('only a live Admin can search recipients, preview or issue; client role cannot override the account', async()=>{
  for(const role of ['Editor','Viewer'] as const){const f=await setup();try{const req=await request(f);f.setActor({...actor,role});assert.equal((await f.get('view=campaign-people')).status,403);assert.equal((await preview(f)).status,403);assert.equal((await f.post(req)).status,403);empty(f);}finally{f.sqlite.close();}}
  for(const sql of ["UPDATE local_users SET role='Editor' WHERE id='issuer'","UPDATE local_users SET status='Disabled' WHERE id='issuer'","UPDATE local_users SET email='changed@example.com' WHERE id='issuer'","DELETE FROM local_users WHERE id='issuer'"]){const f=await setup();try{const req=await request(f);f.sqlite.exec(sql);assert.equal((await f.get('view=campaign-people')).status,403);assert.equal((await preview(f)).status,403);assert.equal((await f.post(req)).status,403);empty(f);}finally{f.sqlite.close();}}
});
test('strict input bounds reject duplicate/empty/oversized recipient lists and malformed dates without truncation', async()=>{
  const f=await setup();try{for(const patch of [{policyId:'../bad'},{name:'x'},{name:'x'.repeat(201)},{audience:'x'},{audience:'x'.repeat(501)},{name:'Null\u0000 text'},{dueDate:'2026-02-31'},{dueDate:future(-1)},{dueDate:future()+'junk'},{subjectIds:[]},{subjectIds:['reader','reader']},{subjectIds:Array.from({length:501},(_,i)=>`person-${i}`)},{subjectIds:['../bad']},{subjectIds:'reader'}])assert.equal((await preview(f,patch)).status,400,JSON.stringify(patch));const req=await request(f);for(const patch of [{issueMode:undefined},{issueMode:'wrong'},{requestId:'not-an-id'},{expectedRevision:''},{confirmation:'yes'}])assert.equal((await f.post({...req,...patch})).status,400);empty(f);}finally{f.sqlite.close();}
});
test('unknown, disabled or scoped recipients are identified and never silently omitted', async()=>{
  const f=await setup();try{for(const id of ['absent','disabled','scoped']){const result=await preview(f,{subjectIds:['reader',id]});assert.equal(result.status,409);assert.deepEqual(result.body.unavailableIds,[id]);}f.sqlite.exec("UPDATE local_users SET email='READER@EXAMPLE.COM' WHERE id='writer'");const result=await preview(f);assert.equal(result.status,409);assert.deepEqual(result.body.unavailableIds,['reader','writer']);empty(f);}finally{f.sqlite.close();}
});
test('only intact current published policy content can be issued', async()=>{
  for(const sql of ["UPDATE policy_documents SET status='retired'","UPDATE policy_documents SET current_version_id='missing'","UPDATE policy_versions SET status='superseded'","UPDATE policy_versions SET content='tampered'","UPDATE policy_versions SET content_sha256='bad'","UPDATE policy_versions SET control_refs_json='{}'","UPDATE policy_versions SET regulation_refs_json='[null]'","UPDATE policy_versions SET effective_date='2026-10-28junk'"]){const f=await setup();try{f.sqlite.exec(sql);assert.ok([404,409].includes((await preview(f)).status),sql);empty(f);}finally{f.sqlite.close();}}
});
test('full policy/version changes reject stale previews and mutations racing the transaction', async()=>{
  for(const sql of ["UPDATE policy_documents SET title='A different policy title'","UPDATE policy_documents SET audience='A changed audience'","UPDATE policy_documents SET status='retired'","UPDATE policy_versions SET summary='Changed source summary'","UPDATE policy_versions SET control_refs_json='[\"CTRL-2\"]'","UPDATE policy_versions SET status='superseded'","UPDATE policy_documents SET current_version_id='other'"])for(const race of [false,true]){const f=await setup();try{const req=await request(f);if(race)f.before(()=>f.sqlite.exec(sql));else f.sqlite.exec(sql);assert.ok([404,409].includes((await f.post(req)).status),sql);empty(f);}finally{f.sqlite.close();}}
});
test('recipient identity, name, role, status, existence and access changes are guarded at commit', async()=>{
  for(const sql of ["UPDATE local_users SET name='Changed reader' WHERE id='reader'","UPDATE local_users SET email='changed@example.com' WHERE id='reader'","UPDATE local_users SET role='Editor' WHERE id='reader'","UPDATE local_users SET status='Disabled' WHERE id='reader'","DELETE FROM local_users WHERE id='reader'","INSERT INTO user_module_access VALUES('reader','{\"mode\":\"scoped\",\"modules\":{}}')"])for(const race of [false,true]){const f=await setup();try{const req=await request(f);if(race)f.before(()=>f.sqlite.exec(sql));else f.sqlite.exec(sql);assert.equal((await f.post(req)).status,409,sql);empty(f);}finally{f.sqlite.close();}}
});
test('issuer identity, role, status, name and access policy are bound in the transaction', async()=>{
  for(const sql of ["UPDATE local_users SET name='Changed issuer' WHERE id='issuer'","UPDATE local_users SET role='Editor' WHERE id='issuer'","UPDATE local_users SET email='changed@example.com' WHERE id='issuer'","UPDATE local_users SET status='Disabled' WHERE id='issuer'","DELETE FROM local_users WHERE id='issuer'","INSERT INTO user_module_access VALUES('issuer','{\"mode\":\"full\"}')"]){const f=await setup();try{const req=await request(f);f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(req)).status,409,sql);empty(f);}finally{f.sqlite.close();}}
});
test('identical lost-response retries recover original campaigns after later source, participant and outcome changes', async()=>{
  const f=await setup();try{const req=await request(f);assert.equal((await f.post(req)).status,200);f.sqlite.exec("UPDATE policy_attestation_campaigns SET status='closed';UPDATE policy_versions SET status='superseded';UPDATE policy_documents SET status='retired';UPDATE local_users SET status='Disabled' WHERE id='reader';UPDATE policy_attestations SET status='declined'");assert.equal((await f.post({...req,subjectIds:['reader','writer']})).body.replay,true);assert.equal(count(f),1);assert.equal(count(f,'policy_attestations'),2);assert.equal(count(f,'policy_events'),1);for(const patch of [{name:'Changed campaign name'},{dueDate:future(31)},{subjectIds:['writer']},{expectedRevision:'f'.repeat(64)}])assert.equal((await f.post({...req,...patch})).status,409);f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='issuer'");assert.equal((await f.post(req)).status,403);}finally{f.sqlite.close();}
});
test('concurrent identical submissions return one canonical campaign and one creation event', async()=>{
  const f=await setup();try{const req=await request(f),results=await Promise.all([f.post(req),f.post(req)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.deepEqual(results.map(r=>r.body.replay).sort(),[false,true]);assert.equal(count(f),1);assert.equal(count(f,'policy_events'),1);assert.equal(count(f,'policy_attestations'),2);}finally{f.sqlite.close();}
});
test('failed participant/event writes roll back every assignment and the campaign', async()=>{
  for(const trigger of ["BEFORE INSERT ON policy_attestations WHEN NEW.subject_email='writer@example.com'","BEFORE INSERT ON policy_events"]){const f=await setup();try{f.sqlite.exec(`CREATE TRIGGER fail_issue ${trigger} BEGIN SELECT RAISE(ABORT,'forced-failure'); END`);assert.equal((await f.post(await request(f))).status,400);empty(f);}finally{f.sqlite.close();}}
});
test('500 explicitly selected accounts commit within bounded SQL parameters', async()=>{
  const f=await setup();try{const ids=[];for(let i=0;i<500;i++){const id=`bulk-${String(i).padStart(3,'0')}`;ids.push(id);f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com','Viewer','Active');}assert.equal((await f.post(await request(f,{subjectIds:ids}))).status,200);assert.equal(count(f,'policy_attestations'),500);assert.equal(count(f,'policy_events'),1);}finally{f.sqlite.close();}
});
test('legacy create clients remain compatible and do not acquire a reviewed directory claim', async()=>{
  const f=await setup();try{const result=await f.post({action:'create-campaign',policyId:'POL-1',versionId:'PV-1',name:'Legacy campaign',audience:'Legacy contacts',dueDate:future(),subjects:['external@example.com']});assert.equal(result.status,200);assert.equal(count(f),1);const event=f.sqlite.prepare('SELECT * FROM policy_events').get()!;assert.notEqual(event.id,result.body.id);assert.equal(String(event.detail).includes('directory-reviewed-campaign'),false);}finally{f.sqlite.close();}
});
