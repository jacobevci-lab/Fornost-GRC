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
