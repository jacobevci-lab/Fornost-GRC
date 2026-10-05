import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
export async function checkAlertObservations({api,maker,page,sql,q,modelId,base}){
 const policyId=`QA-POL-${crypto.randomUUID()}`,monitorId=`QA-MON-${crypto.randomUUID()}`,now=new Date().toISOString();
 const alerts=async()=>(await api(maker,'/api/ai/assurance-alerts')).alerts.filter(a=>a.policyId===policyId);
 try{
  await sql(`INSERT INTO ai_assurance_policies(id,model_id,owner,min_accuracy,max_error_rate,max_drift_score,max_bias_score,max_p95_latency_ms,min_sample_size,frequency_days,evidence_plan,breach_action,review_date,status,created_by,created_at,updated_by,updated_at) VALUES(${q(policyId)},${q(modelId)},'QA',90,5,10,5,100,10,30,'QA evidence','QA review','2090-01-01','approved','QA',${q(now)},'QA',${q(now)});
  INSERT INTO ai_model_monitoring(id,model_id,accuracy,error_rate,drift_score,bias_score,p95_latency_ms,sample_size,health,recorded_by,recorded_at) VALUES(${q(monitorId)},${q(modelId)},99,1,20,1,10,100,'alert','QA',${q(now)});
  CREATE TRIGGER qa_observation_audit_failure BEFORE INSERT ON ai_activity_logs WHEN NEW.action='ai-assurance-alert-observe' AND NEW.context_refs_json LIKE ${q('%'+policyId+'%')} BEGIN SELECT RAISE(ABORT,'QA observation audit failure'); END;`);
  await api(maker,'/api/ai/assurance-alerts','POST',undefined,503);assert.deepEqual(await alerts(),[]);await sql('DROP TRIGGER qa_observation_audit_failure;');
  await Promise.all([api(maker,'/api/ai/assurance-alerts','POST'),api(maker,'/api/ai/assurance-alerts','POST')]);
  const first=await alerts();assert.equal(first.length,1);assert.equal(first[0].occurrenceCount,1);
  await api(maker,'/api/ai/assurance-alerts','POST');assert.deepEqual(await alerts(),first);
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();await page.locator('nav button[aria-label="AI Governance"]').evaluate(el=>el.click());await page.locator('.ai-section-picker>summary').click();await page.locator('.fornost-ai-tabs').getByRole('button',{name:'AI Alarmlar',exact:true}).click();
  const root=page.locator('.ai-alerts');await expect(root.getByRole('button',{name:'Ölçümleri Tara',exact:true})).toBeEnabled();await root.getByRole('button',{name:'Ölçümleri Tara',exact:true}).click();await expect(root.locator('.notice')).toContainText('0 yeni ölçüm işlendi');assert.deepEqual(await alerts(),first);
  await sql(`INSERT INTO ai_model_monitoring(id,model_id,accuracy,error_rate,drift_score,bias_score,p95_latency_ms,sample_size,health,recorded_by,recorded_at) VALUES(${q(monitorId+'-next')},${q(modelId)},99,1,20,1,10,100,'alert','QA',${q(new Date(Date.now()+1000).toISOString())});`);
  await api(maker,'/api/ai/assurance-alerts','POST');const second=(await alerts())[0];assert.equal(second.id,first[0].id);assert.equal(second.occurrenceCount,2);assert.notEqual(second.revision,first[0].revision);
  await sql(`UPDATE ai_assurance_alerts SET status='resolved' WHERE id=${q(second.id)};UPDATE ai_model_monitoring SET drift_score=30 WHERE id=${q(monitorId+'-next')};`);const closed=await alerts();await api(maker,'/api/ai/assurance-alerts','POST');assert.deepEqual(await alerts(),closed);
 }finally{await sql(`DROP TRIGGER IF EXISTS qa_observation_audit_failure;DELETE FROM ai_assurance_alerts WHERE policy_id=${q(policyId)};DELETE FROM ai_assurance_policies WHERE id=${q(policyId)};DELETE FROM ai_model_monitoring WHERE id IN (${q(monitorId)},${q(monitorId+'-next')});DELETE FROM ai_activity_logs WHERE context_refs_json LIKE ${q('%'+policyId+'%')};`);}
}
