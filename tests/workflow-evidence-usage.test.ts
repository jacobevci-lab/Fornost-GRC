import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/evidence-usage-fixture';
import {readEvidenceUsage} from '../app/evidence/usage-store';
import {usageNeedsReview} from '../app/evidence/usage';

function setup() {
 const f=fixture();
 f.sql.exec(`INSERT INTO enterprise_continuity_plans VALUES('BCP-1','Recovery');
 INSERT INTO enterprise_continuity_exercises VALUES('BCE-1','BCP-1','Exercise','owner','completed','2026-10-20');
 INSERT INTO enterprise_continuity_gaps VALUES('BCG-1','BCP-1','Recovery gap','owner','closed','2026-10-20');
 INSERT INTO regulatory_intelligence_sources VALUES('SRC-1');
 INSERT INTO regulatory_changes VALUES('RC-1','SRC-1','New regulation');
 INSERT INTO regulatory_change_impacts VALUES('RI-1','RC-1','Access control','owner','verification','2026-11-20');`);
 const pin=(id:string,workflow:string,entity:string,purpose:string,version='v1',extra:Record<string,unknown>={})=>f.sql.prepare('INSERT INTO workflow_evidence_pins VALUES(?,?,?,?,?,?,?)').run(id,workflow,entity,purpose,JSON.stringify({evidenceId:'EVD-1',id:version,versionNo:version==='v2'?2:1,contentSha256:version==='v2'?'hash2':'hash1',fileKey:'private-storage-key',...extra}),'reviewer@example.test','2026-10-27T08:00:00.000Z');
 return {...f,pin};
}
test('policy decisions retain all six purposes, exact source targets and explicit missing-parent coverage',async()=>{
 const f=setup();try{
  f.sql.exec(`INSERT INTO policy_documents VALUES('POL-1','POL-100','Access policy','owner','retired','2027-01-01');
    INSERT INTO policy_versions VALUES('PV-1','POL-1',1,'superseded');
    INSERT INTO policy_exceptions VALUES('PEX-1','POL-1','PV-1','Migration','owner','closed','2026-12-01');`);
  for(const purpose of ['version-submit','version-approve','version-publish','approve-exception','close-exception','policy-retire'])f.pin(purpose,'policy',purpose.startsWith('version-')?'PV-1':purpose==='policy-retire'?'POL-1':'PEX-1',purpose);
  let result=await readEvidenceUsage(f.db,{role:'Viewer'},'EVD-1');const rows=result.rows.filter(r=>r.source==='policy');assert.equal(rows.length,6);assert.ok(rows.every(r=>r.historical&&r.decision?.sourceAvailable&&!usageNeedsReview(r)&&r.pins[0].state==='older'));
  for(const row of rows){assert.deepEqual(row.target,{module:'Politika Merkezi',kind:row.id.startsWith('version-')?'policy-version':row.id==='policy-retire'?'policy-review':'policy-exception',ref:row.id.startsWith('version-')?'PV-1':row.id==='policy-retire'?'POL-1':'PEX-1',source:'evidence-usage'});assert.equal(row.title,'POL-100 · Access policy'+(row.id.startsWith('version-')?' · v1':row.id==='policy-retire'?'':' · Migration'));}
  f.sql.exec("UPDATE policy_exceptions SET version_id='missing'");result=await readEvidenceUsage(f.db,{role:'Viewer'},'EVD-1');assert.equal(result.sources.find(s=>s.key==='policy')!.state,'limited');assert.ok(result.rows.filter(r=>r.target.kind==='policy-exception').every(r=>!r.decision?.sourceAvailable));
  f.queries.length=0;const scoped=await readEvidenceUsage(f.db,{role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kanıtlar:'read'}}},'EVD-1');assert.equal(scoped.sources.find(s=>s.key==='policy')!.state,'restricted');assert.ok(f.queries.every(q=>!q.includes('policy_documents')));
  for(let i=0;i<201;i++)f.pin('extra-'+i,'policy','PV-1','version-submit');result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');assert.equal(result.rows.filter(r=>r.source==='policy').length,200);assert.equal(result.sources.find(s=>s.key==='policy')!.state,'limited');
 }finally{f.sql.close()}
});
test('decision uses retain separate purposes and older submissions without claiming a current approval',async()=>{
 const f=setup();try {
  f.pin('pin-ex','continuity','BCE-1','exercise-result');f.pin('pin-gap','continuity','BCG-1','gap-closure');
  f.pin('pin-submit-old','regulatory','RI-1','impact-submit');f.pin('pin-submit-new','regulatory','RI-1','impact-submit','v2');f.pin('pin-verify','regulatory','RI-1','impact-verify','v2');
  const before=f.sql.prepare('SELECT total_changes() n').get()!.n;
  const result=await readEvidenceUsage(f.db,{role:'Viewer'},'EVD-1');
  const rows=result.rows.filter(r=>r.decision);assert.equal(rows.length,5);
  assert.ok(rows.every(r=>r.historical&&!usageNeedsReview(r)&&r.decision?.sourceAvailable));
  assert.ok(rows.every(r=>r.decision?.actor==='reviewer@example.test'&&r.decision.createdAt==='2026-10-27T08:00:00.000Z'));
  assert.equal(rows.filter(r=>r.pins[0].state==='older').length,3);assert.equal(rows.filter(r=>r.pins[0].state==='current').length,2);
  assert.equal(rows.find(r=>r.id==='pin-verify')!.status,'verification','Live state is distinct from the retained historical verification');
  assert.deepEqual(rows.find(r=>r.id==='pin-gap')!.target,{module:'İş Sürekliliği',kind:'continuity-gap',ref:'BCG-1',source:'evidence-usage'});
  assert.deepEqual(rows.find(r=>r.id==='pin-submit-old')!.target,{module:'Regülasyon Merkezi',kind:'regulatory-impact',ref:'RI-1',source:'evidence-usage'});
  assert.ok(result.sources.every(s=>s.state==='complete'));
  assert.equal(/private-storage-key|hash1|hash2|snapshot_json|contentSha256/.test(JSON.stringify(result)),false);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get()!.n,before,'Usage reads do not mutate business records or pins');
 }finally{f.sql.close()}
});
test('version identity, exact evidence IDs and canonical decisions are enforced without inventing legacy pins',async()=>{
 const f=setup();try {
  assert.equal((await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1')).rows.filter(r=>r.decision).length,0);
  f.pin('bad-hash','regulatory','RI-1','impact-submit','v1',{contentSha256:'forged'});
  f.pin('bad-id','regulatory','RI-1','impact-verify','missing');
  f.pin('other','continuity','BCE-1','exercise-result','v1',{evidenceId:'EVD-1000'});
  const rows=(await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1')).rows.filter(r=>r.decision);
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.pins[0].state==='unknown'));
 }finally{f.sql.close()}
});
test('orphaned decisions remain visible as incomplete usage; corrupt or missing sources are unavailable',async()=>{
 const f=setup();try {
  f.pin('ex','continuity','BCE-1','exercise-result');f.pin('impact','regulatory','RI-1','impact-submit');
  f.sql.exec('DELETE FROM enterprise_continuity_plans');
  let result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');
  assert.equal(result.rows.find(r=>r.id==='ex')?.decision?.sourceAvailable,false);
  assert.equal(result.sources.find(s=>s.key==='continuity')?.state,'limited');
  f.sql.exec('DROP TABLE enterprise_continuity_exercises');
  result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');
  assert.equal(result.sources.find(s=>s.key==='continuity')?.state,'unavailable');assert.ok(result.rows.some(r=>r.id==='impact'));
  f.sql.exec("UPDATE workflow_evidence_pins SET snapshot_json='invalid JSON' WHERE id='impact'");
  result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');
  assert.equal(result.sources.find(s=>s.key==='regulatory')?.state,'unavailable');assert.equal(result.rows.some(r=>r.source==='regulatory'),false);
 }finally{f.sql.close()}
});
test('each workflow discloses a 200-decision bound and scoped readers never query decision tables',async()=>{
 const f=setup();try {
  for(let i=0;i<201;i++)f.pin('pin-'+i,'regulatory','RI-1','impact-submit');
  const result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');
  assert.equal(result.rows.filter(r=>r.source==='regulatory').length,200);assert.equal(result.sources.find(s=>s.key==='regulatory')?.state,'limited');
  f.queries.length=0;
  const restricted=await readEvidenceUsage(f.db,{role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kanıtlar:'read','Denetim Yönetimi':'read'}}},'EVD-1');
  assert.ok(restricted.sources.filter(s=>['continuity','regulatory'].includes(s.key)).every(s=>s.state==='restricted'));
  assert.ok(f.queries.every(q=>!q.includes('workflow_evidence_pins')&&!q.includes('enterprise_continuity')&&!q.includes('regulatory_')));
 }finally{f.sql.close()}
});

test('TPRM retains all six decision purposes with exact assessment, finding and exit navigation',async()=>{
 const f=setup();try{
  f.record('VEN-1','Tedarikçiler',{title:'Cloud supplier'});
  f.sql.exec(`INSERT INTO third_party_profiles VALUES('VEN-1','Cloud supplier','Hosting','owner','offboarded','2026-12-01');
   INSERT INTO third_party_assessments VALUES('TPA-1','VEN-1',1,'approved');
   INSERT INTO third_party_findings VALUES('TPF-1','VEN-1','TPA-1','Access gap','owner','closed','2026-12-01')`);
  const purposes=['assessment-submit','assessment-approved','assessment-conditional','submit-finding','verify-finding','vendor-offboard'];
  for(const purpose of purposes)f.pin(purpose,'tprm',purpose.startsWith('assessment-')?'TPA-1':purpose==='vendor-offboard'?'VEN-1':'TPF-1',purpose);
  let result=await readEvidenceUsage(f.db,{role:'Viewer'},'EVD-1');let rows=result.rows.filter(r=>r.source==='tprm');
  assert.equal(rows.length,6);assert.ok(rows.every(r=>r.historical&&r.decision?.sourceAvailable&&r.pins[0].state==='older'&&!usageNeedsReview(r)));
  assert.equal(rows.find(r=>r.id==='assessment-submit')!.status,'approved');
  for(const row of rows)assert.deepEqual(row.target,{module:'Tedarikçiler',kind:row.id.startsWith('assessment-')?'vendor-assessment':row.id==='vendor-offboard'?'vendor-review':'vendor-finding',ref:row.id.startsWith('assessment-')?'TPA-1':row.id==='vendor-offboard'?'VEN-1':'TPF-1',source:'evidence-usage'});
  f.sql.exec("UPDATE third_party_findings SET vendor_id='missing'");
  result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');rows=result.rows.filter(r=>r.source==='tprm');
  assert.equal(rows.length,6);assert.ok(rows.filter(r=>r.target.kind==='vendor-finding').every(r=>!r.decision?.sourceAvailable));assert.equal(result.sources.find(s=>s.key==='tprm')!.state,'limited');
  f.sql.exec("DELETE FROM simple_grc_records WHERE id='VEN-1'");
  assert.ok((await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1')).rows.filter(r=>r.source==='tprm').every(r=>!r.decision?.sourceAvailable));
  f.sql.exec("UPDATE workflow_evidence_pins SET snapshot_json='broken' WHERE id='vendor-offboard'");
  assert.equal((await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1')).sources.find(s=>s.key==='tprm')!.state,'unavailable');
 }finally{f.sql.close()}
});
test('TPRM usage exposes its bound and never reads restricted decision sources',async()=>{
 const f=setup();try{
  for(let i=0;i<201;i++)f.pin('tprm-'+i,'tprm','TPA-1','assessment-submit');
  const result=await readEvidenceUsage(f.db,{role:'Admin'},'EVD-1');assert.equal(result.rows.filter(r=>r.source==='tprm').length,200);assert.equal(result.sources.find(s=>s.key==='tprm')!.state,'limited');
  f.queries.length=0;const restricted=await readEvidenceUsage(f.db,{role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kanıtlar:'read'}}},'EVD-1');
  assert.equal(restricted.sources.find(s=>s.key==='tprm')!.state,'restricted');assert.ok(f.queries.every(q=>!q.includes('third_party_')&&!q.includes('workflow_evidence_pins')));
 }finally{f.sql.close()}
});
