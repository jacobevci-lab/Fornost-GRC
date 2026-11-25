import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { decideRiskReview, findRiskRecord, riskReviewBlocker, riskRevision, submitRiskReview, type RiskRecord, type RiskReviewRow } from '../app/risk-review-runtime';
import { preserveRiskGovernance } from '../app/risk-governance-write';
import { validateRiskReviewProposal } from '../app/assurance-governance';

const stamp='2026-10-02T10:00:00.000Z', maker='maker@fornost.test', checker='checker@fornost.test';
const proposal={riskId:'RISK',residualLikelihood:2,residualImpact:3,rationale:'A documented, independently reviewed residual exposure proposal.',evidenceReference:'EVD-001',evidenceSha256:'a'.repeat(64)};
function fixture() {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT);
 CREATE TABLE continuous_assurance_risk_reviews(id TEXT PRIMARY KEY,risk_id TEXT,status TEXT,proposal_json TEXT,submitted_by TEXT,submitted_at TEXT,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT);`);
 const data={title:'Payment outage',owner:'Owner',asset:'Payments',riskId:'LEGACY',inherentLikelihood:'4',inherentImpact:'5',residualLikelihood:'4',residualImpact:'4',residualRiskReviewRequired:true,riskReviewRequestedAt:stamp,assuranceState:'ineffective',lastAssuranceRunRef:'RUN-1'};
 sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('RISK','Risk Assessment',JSON.stringify(data),stamp,stamp);
 sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?)').run('RISK','RSK-001');
 let beforeBatch:(()=>void)|null=null;
 function prepare(sql:string,values:(string|number|null)[]=[]){return{
  bind(...args:(string|number|null)[]){return prepare(sql,args);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},
  exec(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}};},async run(){return this.exec();},
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=null;hook?.();sqlite.exec('BEGIN');try{const result=statements.map(s=>s.exec());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
 const risk=()=>sqlite.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE id='RISK'").get() as RiskRecord;
 const review=(id:string)=>sqlite.prepare('SELECT * FROM continuous_assurance_risk_reviews WHERE id=?').get(id) as RiskReviewRow;
 const write=(delta:Record<string,unknown>)=>sqlite.prepare("UPDATE simple_grc_records SET data_json=? WHERE id='RISK'").run(JSON.stringify({...JSON.parse(risk().data_json),...delta}));
 const submit=async(extra:Record<string,unknown>={})=>submitRiskReview(db,{...proposal,expectedRiskRevision:await riskRevision(risk()),...extra},maker,new Date(stamp));
 return {sqlite,db,risk,review,write,submit,interleave:(hook:()=>void)=>{beforeBatch=hook;}};
}

test('public codes resolve to one canonical risk and the proposal snapshots the server context',async()=>{
 const f=fixture();try{
  const result=await f.submit({riskId:'RSK-001',baseline:{version:1,dataSha256:'spoof'}}),stored=JSON.parse(f.review(result.id).proposal_json);
  assert.equal(result.riskId,'RISK');assert.equal(stored.riskId,'RISK');assert.equal(stored.baseline.context.title,'Payment outage');assert.notEqual(stored.baseline.dataSha256,'spoof');
  assert.equal(await riskReviewBlocker(f.review(result.id),f.risk()),null);
  await assert.rejects(f.submit({riskId:'LEGACY'}),/bekleyen bir teklif/);
 }finally{f.sqlite.close();}
});
test('ambiguous aliases are rejected while an exact record identity remains authoritative',async()=>{
 const f=fixture();try{f.sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('OTHER','Risk Assessment',JSON.stringify({riskId:'LEGACY'}),stamp,stamp);await assert.rejects(findRiskRecord(f.db,'LEGACY'),/birden fazla/);assert.equal((await findRiskRecord(f.db,'RISK'))?.id,'RISK');}finally{f.sqlite.close();}
});
test('a stale form and concurrent duplicate submissions cannot create a new or duplicate pending decision',async()=>{
 const f=fixture();try{const revision=await riskRevision(f.risk());f.write({owner:'Changed owner'});await assert.rejects(f.submit({expectedRiskRevision:revision}),/güncel değil/);const result=await Promise.allSettled([f.submit(),f.submit()]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM continuous_assurance_risk_reviews').get()!.n,1);}finally{f.sqlite.close();}
});
test('independent approval atomically records the decision, preserves inherent risk and cannot be repeated',async()=>{
 const f=fixture();try{const {id}=await f.submit();await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'approve'},maker.toUpperCase()),/Maker-checker/);assert.deepEqual(await decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker),{status:'approved'});const data=JSON.parse(f.risk().data_json);assert.equal(data.residualScore,'6');assert.equal(data.inherentImpact,'5');assert.equal(data.residualRiskReviewRequired,false);assert.equal(data.residualRiskApprovedBy,checker);assert.equal(f.review(id).status,'approved');await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'reject',note:'Do not override the decision'},'third@fornost.test'),/artık/);}finally{f.sqlite.close();}
});
test('changed risk content is rejected even with an unchanged timestamp; rejection allows fresh resubmission',async()=>{
 const f=fixture();try{const {id}=await f.submit();f.write({lastAssuranceRunRef:'NEW-RUN',residualLikelihood:'5'});assert.equal(await riskReviewBlocker(f.review(id),f.risk()),'risk-changed');await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker),/risk-changed/);assert.equal(JSON.parse(f.risk().data_json).residualLikelihood,'5');await decideRiskReview(f.db,{reviewId:id,decision:'reject',note:'A newer control result requires reassessment.'},checker);assert.ok((await f.submit()).id);}finally{f.sqlite.close();}
});
test('legacy, malformed, missing and no-longer-required proposals fail closed',async()=>{
 for(const variant of ['legacy','proposal','risk-json','deleted','not-required']){const f=fixture();try{const {id}=await f.submit();if(variant==='legacy')f.sqlite.prepare('UPDATE continuous_assurance_risk_reviews SET proposal_json=?').run(JSON.stringify(proposal));if(variant==='proposal')f.sqlite.exec("UPDATE continuous_assurance_risk_reviews SET proposal_json='broken'");if(variant==='risk-json')f.sqlite.exec("UPDATE simple_grc_records SET data_json='broken'");if(variant==='deleted')f.sqlite.exec('DELETE FROM simple_grc_records');if(variant==='not-required')f.write({residualRiskReviewRequired:false});await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker));assert.equal(f.review(id).status,'pending-review');}finally{f.sqlite.close();}}
});
test('concurrent human edits and competing decisions cannot be overwritten during the commit',async()=>{
 const f=fixture();try{const {id}=await f.submit();f.interleave(()=>f.write({owner:'Concurrent editor'}));await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker),/başka bir işlemde/);assert.equal(f.review(id).status,'pending-review');assert.equal(JSON.parse(f.risk().data_json).owner,'Concurrent editor');await decideRiskReview(f.db,{reviewId:id,decision:'reject',note:'Refresh this changed assessment'},checker);const next=await f.submit();const outcomes=await Promise.allSettled([decideRiskReview(f.db,{reviewId:next.id,decision:'approve'},checker),decideRiskReview(f.db,{reviewId:next.id,decision:'approve'},'other@fornost.test')]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);}finally{f.sqlite.close();}
});
test('risk write errors roll back the decision and a clean retry can succeed',async()=>{
 const f=fixture();try{const {id}=await f.submit();f.sqlite.exec("CREATE TRIGGER fail_risk BEFORE UPDATE ON simple_grc_records BEGIN SELECT RAISE(ABORT,'QA failure'); END");await assert.rejects(decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker),/QA failure/);assert.equal(f.review(id).status,'pending-review');assert.equal(JSON.parse(f.risk().data_json).residualRiskReviewRequired,true);f.sqlite.exec('DROP TRIGGER fail_risk');assert.equal((await decideRiskReview(f.db,{reviewId:id,decision:'approve'},checker)).status,'approved');}finally{f.sqlite.close();}
});
test('generic register updates preserve governed ratings and cannot forge or erase decision metadata',()=>{
 const existing={residualRiskReviewRequired:true,residualLikelihood:'4',residualImpact:'4',assuranceState:'ineffective',riskReviewRequestedAt:stamp};
 const update=preserveRiskGovernance({title:'Edited risk',residualRiskReviewRequired:false,residualLikelihood:'1',residualRiskApprovedBy:maker,assuranceState:'effective'},existing);
 assert.deepEqual(update,{title:'Edited risk',...existing});assert.deepEqual(preserveRiskGovernance({title:'New risk',residualRiskApprovedBy:maker,riskReviewRequestedAt:stamp,assuranceState:'effective'}),{title:'New risk'});
 assert.throws(()=>validateRiskReviewProposal({...proposal,evidenceSha256:'a'.repeat(65)}));
});
