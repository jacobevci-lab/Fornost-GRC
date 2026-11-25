import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureEvidenceAutomationSchema } from '../app/api/evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../app/continuous-assurance-runtime';
import { seedAssessmentReceipt } from './helpers/assessment-fixture';
import { loadExecutiveAssuranceSnapshot } from '../app/executive-assurance-runtime';
import { loadAuditReadiness } from '../app/audit-readiness-runtime';
import { buildExecutiveAssurance, buildAssuranceReportHtml } from '../app/executive-assurance';
import { executiveEvidenceSnapshot, parseExecutiveAssuranceSnapshot } from '../app/executive-assurance-snapshot';
import { applyEvidenceAssuranceSnapshot } from '../app/evidence/assurance-snapshot';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { scopedApiAllowed } from '../app/module-access';

const now = new Date('2026-10-15T12:34:56Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:'); let queries = 0;
  function prepare(sql: string, values: (string | number | null)[] = []) { return {
    bind(...args: (string | number | null)[]) { return prepare(sql, args); },
    exec() { queries++; const results = sqlite.prepare(sql).all(...values); return { results, meta: { changes: Number(sqlite.prepare('SELECT changes() n').get()!.n) } }; },
    async all() { return this.exec(); }, async first() { return this.exec().results[0] || null; }, async run() { return this.exec(); },
  }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sqlite.exec('BEGIN'); try { const result = statements.map(s => s.exec()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db); await ensureAssuranceWorkSchema(db);
  sqlite.exec(readFileSync('drizzle/0079_evidence_lineage_storage.sql', 'utf8'));
  sqlite.exec('CREATE TABLE simple_audits(id TEXT PRIMARY KEY,name TEXT UNIQUE)');
  const audit = (id='A1', name='ISO audit') => sqlite.prepare('INSERT INTO simple_audits VALUES(?,?)').run(id,name);
  const record = (id:string,module:string,data:Record<string,unknown>) => sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,module,JSON.stringify(data),now.toISOString(),now.toISOString());
  const requirement = (id='REQ1',name='ISO audit',ref='C1') => record(id,'Denetim Yönetimi',{auditName:name,controlRef:ref,status:'Tamamlandı',evidenceStatus:'Kanıt Tamam'});
  const evidence = (patch:Record<string,unknown>={}) => record('E1','Kanıtlar',{controlRef:'C1; C2',status:'Approved',expiresAt:'2026-10-15',...patch});
  const automate = async (run='RUN',status='pass') => { sqlite.exec("INSERT OR IGNORE INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SRC','C1','value','gte','90','daily','now','now','qa')"); return seedAssessmentReceipt(sqlite,'RULE',now,run,status); };
  return {sqlite,db,audit,record,requirement,evidence,automate,read:()=>loadExecutiveAssuranceSnapshot(db,now),queries:()=>queries};
}

test('each persisted audit counts once, requirements and saved completion labels cannot inflate readiness',async()=>{
  const f=await fixture();try{
    f.audit();f.audit('A2','Empty audit');f.requirement();f.requirement('REQ2','ISO audit','C2');
    let s=await f.read(), result=buildExecutiveAssurance(s.rows,s.generatedAt,s.auditPortfolio);
    assert.equal(result.totalAudits,2);assert.equal(result.readyAudits,0);assert.equal(result.auditScore,0);
    assert.deepEqual(s.auditPortfolio.audits.map(a=>a.gate),['not-ready','empty']);
    f.evidence();s=await f.read();result=buildExecutiveAssurance(s.rows,s.generatedAt,s.auditPortfolio);
    assert.equal(result.totalAudits,2);assert.equal(result.readyAudits,1);assert.equal(result.auditScore,50);
    assert.equal(s.auditPortfolio.audits[0].requirements,2);assert.equal(s.auditPortfolio.audits[0].gate,(await loadAuditReadiness(f.db,'ISO audit',now)).gate);
    assert.ok(parseExecutiveAssuranceSnapshot(s));
  }finally{f.sqlite.close();}
});

test('missing or empty portfolio has no invented perfect audit or composite score',async()=>{
  const f=await fixture();try{
    const s=await f.read();assert.equal(s.verified,true);
    for(const p of [undefined,s.auditPortfolio]){const result=buildExecutiveAssurance([],now.toISOString(),p);assert.equal(result.auditScore,null);assert.equal(result.score,null);assert.equal(result.state,'unverified');}
    f.audit();f.requirement();f.sqlite.exec('DROP TABLE simple_audits');const unavailable=await f.read();assert.equal(unavailable.verified,false);assert.ok(unavailable.issues.includes('audits-unavailable'));assert.equal(buildExecutiveAssurance([],s.generatedAt,unavailable.auditPortfolio).score,null);
  }finally{f.sqlite.close();}
});

test('healthy evidence cannot hide live failing controls or a pending failed re-test',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();f.evidence();await f.automate('FAIL','fail');let s=await f.read();assert.equal(s.auditPortfolio.audits[0].gate,'not-ready');assert.ok(s.auditPortfolio.audits[0].blockers>0);
    await f.automate('PASS');assert.equal((await f.read()).auditPortfolio.audits[0].gate,'ready');
    f.sqlite.exec("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,actor,created_at,updated_at,result_ref) VALUES('W','F','RULE','control-retest','retest-error','{\"targetControlRef\":\"C1\"}','qa','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z','PASS')");
    s=await f.read();assert.equal(s.auditPortfolio.audits[0].gate,'not-ready');assert.equal(s.auditPortfolio.audits[0].gate,(await loadAuditReadiness(f.db,'ISO audit',now)).gate);
  }finally{f.sqlite.close();}
});

test('changed settings remove readiness until current proof returns and historical evidence is preserved',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();await f.automate();const initial=await f.read();assert.equal(initial.auditPortfolio.audits[0].gate,'ready');
    f.sqlite.exec("UPDATE evidence_automation_rules SET expected='95' WHERE id='RULE'");const changed=await f.read();assert.equal(changed.auditPortfolio.audits[0].gate,'not-ready');
    await f.automate('RECOVERED');const recovered=await f.read();assert.equal(recovered.auditPortfolio.audits[0].gate,'ready');assert.equal(recovered.rows.length,2);assert.equal(recovered.rows.find(r=>r.id===initial.rows[0].id)!.data.automationAssessment,'configuration-changed');
  }finally{f.sqlite.close();}
});

test('manual evidence with a broken chain blocks both detail and portfolio without an automation rule',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();const version=await appendEvidenceVersion(f.db,{evidenceId:'E1',fileKey:'evidence/E1/file',fileName:'proof.txt',fileType:'text/plain',fileSize:5,contentSha256:await sha256HexBytes(new TextEncoder().encode('proof')),evidenceTitle:'Proof',owner:'QA',period:'2026',frameworks:'',controlRefs:'C1',changeNote:'initial',createdBy:'qa',createdAt:now.toISOString()});
    f.evidence({versionNo:1,versionChainSha256:version.chainSha256});assert.equal((await f.read()).auditPortfolio.audits[0].gate,'ready');
    f.sqlite.exec("UPDATE evidence_versions SET content_sha256='tampered' WHERE evidence_id='E1'");const s=await f.read();assert.equal(s.verified,true);assert.equal(s.auditPortfolio.audits[0].gate,'not-ready');assert.equal((await loadAuditReadiness(f.db,'ISO audit',now)).gate,'not-ready');
  }finally{f.sqlite.close();}
});

test('orphan requirements and normalized duplicate audit names make the portfolio explicitly incomplete',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement('ORPHAN','Missing audit');let s=await f.read();assert.equal(s.verified,false);assert.equal(s.auditPortfolio.orphanRequirements,1);assert.ok(s.issues.includes('orphan-requirements'));
    f.sqlite.exec("DELETE FROM simple_grc_records");f.requirement();f.evidence();f.audit('A2',' ISO audit ');s=await f.read();assert.equal(s.verified,false);assert.ok(s.issues.includes('audit-identity-ambiguous'));assert.ok(s.auditPortfolio.audits.every(a=>a.gate==='unverified'));assert.ok(parseExecutiveAssuranceSnapshot(s));
  }finally{f.sqlite.close();}
});

test('unassigned requirements preserve verified evidence while the composite assessment remains blocked',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement('ORPHAN','Missing audit');f.evidence();
    const wire=await f.read(), parsed=parseExecutiveAssuranceSnapshot(wire)!;
    assert.ok(parsed);assert.equal(parsed.verified,false);assert.equal(parsed.evidenceVerified,true);
    assert.deepEqual(parsed.evidenceIssues,[]);assert.equal(parsed.auditPortfolio.verified,false);
    const applied=applyEvidenceAssuranceSnapshot(wire.rows,executiveEvidenceSnapshot(parsed));
    assert.equal(applied.ready,true);
    const metrics=buildExecutiveAssurance(applied.rows,parsed.generatedAt,parsed.auditPortfolio);
    assert.equal(metrics.currentEvidence,1);assert.equal(metrics.score,null);assert.equal(metrics.auditScore,null);
    assert.equal(parseExecutiveAssuranceSnapshot({...wire,verified:true,issues:[]}),null);
    assert.equal(parseExecutiveAssuranceSnapshot({...wire,evidenceVerified:true,evidenceIssues:['evidence-unavailable']}),null);
    assert.equal(parseExecutiveAssuranceSnapshot({...wire,issues:[]}),null);
    f.sqlite.exec('DROP TABLE evidence_versions');const failed=parseExecutiveAssuranceSnapshot(await f.read())!;
    assert.ok(failed);assert.equal(failed.evidenceVerified,false);
    assert.equal(applyEvidenceAssuranceSnapshot(wire.rows,executiveEvidenceSnapshot(failed)).ready,false);
  }finally{f.sqlite.close();}
});

test('malformed requirements, unavailable sources and bounded audit scans never yield a verified portfolio',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();f.evidence();f.sqlite.exec("UPDATE simple_grc_records SET data_json='not-json' WHERE id='REQ1'");assert.ok((await f.read()).issues.includes('records-incomplete'));
    f.sqlite.exec("DELETE FROM simple_grc_records WHERE id='REQ1'");for(let i=2;i<=501;i++)f.audit(`A${i}`,`Audit ${i}`);const bounded=await f.read();assert.equal(bounded.verified,false);assert.equal(bounded.auditPortfolio.audits.length,500);assert.ok(bounded.issues.includes('audits-incomplete'));
    f.sqlite.exec('DROP TABLE evidence_versions');assert.equal((await f.read()).auditPortfolio.verified,false);
  }finally{f.sqlite.close();}
});

test('portfolio reads have a fixed query count independent of engagement count',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();f.evidence();let before=f.queries();await f.read();const one=f.queries()-before;
    for(let i=2;i<=100;i++){f.audit(`A${i}`,`Audit ${i}`);f.requirement(`REQ${i}`,`Audit ${i}`);}
    before=f.queries();const s=await f.read();assert.equal(f.queries()-before,one);assert.equal(s.auditPortfolio.audits.length,100);assert.ok(s.auditPortfolio.audits.every(a=>a.gate==='ready'));
  }finally{f.sqlite.close();}
});

test('combined payload parser rejects absent, inconsistent, duplicated or fabricated ready audits',async()=>{
  const f=await fixture();try{
    f.audit();f.requirement();f.evidence();const s=await f.read(),p=s.auditPortfolio,a=p.audits[0];
    for(const auditPortfolio of [undefined,{...p,generatedAt:'2026-10-14T12:34:56Z'},{...p,verified:false},{...p,audits:[a,a]},{...p,audits:[{...a,current:0}]},{...p,audits:[{...a,requirements:0,current:0}]},{...p,orphanRequirements:1}])assert.equal(parseExecutiveAssuranceSnapshot({...s,auditPortfolio}),null);
  }finally{f.sqlite.close();}
});

test('HTML pack preserves complete audit scope, shared timestamp, language and escaping',async()=>{
  const f=await fixture();try{
    const name='<script>audit</script>';f.audit('A1',name);f.requirement('REQ',name);f.evidence();const s=await f.read();
    for(const tr of [true,false]){const html=buildAssuranceReportHtml(s.rows,tr,s.generatedAt,s.auditPortfolio);assert.ok(html.includes(s.generatedAt));assert.match(html,/&lt;script&gt;audit&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>audit/);assert.ok(html.includes(tr?'Hazır':'Ready'));}
  }finally{f.sqlite.close();}
});

test('executive audit endpoint retains the full Viewer and scoped actor boundary',()=>{
  assert.equal(scopedApiAllowed({role:'Viewer'},'/api/executive-assurance','GET'),true);
  assert.equal(scopedApiAllowed({role:'Viewer',moduleAccess:{mode:'scoped',modules:{'Denetim Yönetimi':'read','Kanıtlar':'read'}}},'/api/executive-assurance','GET'),false);
});
