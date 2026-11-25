import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureEvidenceAutomationSchema } from '../app/api/evidence-automation/core';
import { assessmentFingerprint, ensureAssessmentLineageSchema, retestConfigurationReason } from '../app/evidence/assessment-lineage';

function database(){
  const sql=new DatabaseSync(':memory:');
  function prepare(query:string,values:(string|number|null)[]=[]){return{bind(...args:(string|number|null)[]){return prepare(query,args)},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}}},async all(){return{results:sql.prepare(query).all(...values)}},async first(){return sql.prepare(query).get(...values)||null}}}
  return{sql,db:{prepare} as unknown as D1Database};
}
test('migration and concurrent runtime upgrades retain historical data without inventing lineage',async()=>{
  for(const mode of ['migration','runtime']){
    const f=database();try{
      await ensureEvidenceAutomationSchema(f.db);
      f.sql.exec(`DROP TRIGGER evidence_rule_assessment_revision; DROP TRIGGER evidence_source_assessment_revision; ALTER TABLE evidence_automation_rules DROP COLUMN assessment_revision; ALTER TABLE evidence_automation_runs DROP COLUMN assessment_fingerprint;
        INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('SRC','Name','Vendor','Category','rest-json','{}','old','old','qa');
        INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE','Name','SRC','A.8.1','coverage','gte','90','daily','old','old','qa');
        INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,created_at,actor) VALUES('OLD','RULE','Name','Name','pass',100,'Historical','hash','old','qa');`);
      if(mode==='migration')f.sql.exec(readFileSync('drizzle/0089_assessment_lineage.sql','utf8'));
      await Promise.all([ensureAssessmentLineageSchema(f.db),ensureAssessmentLineageSchema(f.db)]);await ensureAssessmentLineageSchema(f.db);
      assert.equal(f.sql.prepare('SELECT assessment_fingerprint FROM evidence_automation_runs').get()!.assessment_fingerprint,null);
      assert.equal(f.sql.prepare('SELECT assessment_revision FROM evidence_automation_rules').get()!.assessment_revision,0);
      f.sql.exec("UPDATE evidence_automation_rules SET expected='99'; UPDATE evidence_automation_sources SET config_json='changed';");
      assert.equal(f.sql.prepare('SELECT assessment_revision FROM evidence_automation_rules').get()!.assessment_revision,2);
      assert.equal(f.sql.prepare('SELECT detail FROM evidence_automation_runs').get()!.detail,'Historical');
    }finally{f.sql.close();}
  }
});
test('recovery and reconciliation use the same configuration verdict and normalized target scope',async()=>{
  const rule={id:'R',source_id:'S',enabled:1,control_refs:'A.8.1, A.8.2',assessment_revision:0},source={id:'S',enabled:1,secret_ciphertext:'opaque-encrypted-value'};
  const fingerprint=await assessmentFingerprint(rule,source);assert.match(fingerprint,/^[a-f0-9]{64}$/);assert.ok(!fingerprint.includes(source.secret_ciphertext));
  assert.equal(await retestConfigurationReason(rule,source,fingerprint),null);
  assert.equal(await retestConfigurationReason(rule,source,fingerprint,'a.8.1'),null);
  assert.equal(await retestConfigurationReason(rule,source,fingerprint,'A.8.3'),'control-scope-changed');
  assert.equal(await retestConfigurationReason(rule,source,null),'configuration-unverified');
  const changedRule={...rule,assessment_revision:1};
  assert.equal(await retestConfigurationReason(changedRule,source,fingerprint),'configuration-changed');
  assert.equal(await retestConfigurationReason(rule,{...source,enabled:0},fingerprint),'source-unavailable');
});
