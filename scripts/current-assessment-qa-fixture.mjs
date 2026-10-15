import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const q=value=>`'${String(value).replaceAll("'","''")}'`;
// Only explicit synthetic QA rows in local D1. Never stamp historical/live evidence.
export async function seedCurrentAssessmentFixture({ruleIds,prefix,out,status='pass'}){
  if(!ruleIds.length || !ruleIds.every(id=>/^QA-[A-Z0-9-]+$/.test(id)) || !/^QA-[A-Z0-9-]+$/.test(prefix))throw Error('Synthetic QA identifiers required');
  const stamp=new Date().toISOString(),receipts=[];
  for(let offset=0;offset<ruleIds.length;offset+=80){
    const ids=ruleIds.slice(offset,offset+80),sql=`SELECT r.*,s.driver AS fixture_driver,s.enabled AS fixture_enabled,s.config_json AS fixture_config,s.secret_ciphertext AS fixture_secret FROM evidence_automation_rules r JOIN evidence_automation_sources s ON s.id=r.source_id WHERE r.id IN (${ids.map(q).join(',')})`;
    const result=JSON.parse(execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--json','--command',sql],{encoding:'utf8',timeout:60000}))[0].results;
    if(result.length!==ids.length)throw Error('Synthetic fixture rows missing');
    const stamped=JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {assessmentFingerprint} from './app/evidence/assessment-lineage.ts';let raw='';for await(const chunk of process.stdin)raw+=chunk;const rows=JSON.parse(raw);process.stdout.write(JSON.stringify(await Promise.all(rows.map(async r=>({id:r.id,name:r.name,controlRefs:r.control_refs,hours:r.freshness_hours,fingerprint:await assessmentFingerprint(r,{id:r.source_id,driver:r.fixture_driver,enabled:r.fixture_enabled,config_json:r.fixture_config,secret_ciphertext:r.fixture_secret})})))));"],{input:JSON.stringify(result),encoding:'utf8',timeout:30000}));
    receipts.push(...stamped);
  }
  const statements=[];
  for(const [i,row] of receipts.entries()){
    const runId=`${prefix}-RUN-${i}`,evidenceId=`${prefix}-EVD-${i}`,hash='d'.repeat(64);
    const evidence={evidenceTitle:'QA current assessment proof',controlRef:row.controlRefs,status:'Approved',validationStatus:status,responseHash:hash,collectedAt:stamp,freshUntil:new Date(Date.parse(stamp)+row.hours*3600000).toISOString(),assessmentFingerprint:row.fingerprint,automationRunId:runId,automationRuleId:row.id};
    if(status==='pass')statements.push(`INSERT INTO simple_grc_records VALUES(${q(evidenceId)},'Kanıtlar',${q(JSON.stringify(evidence))},${q(stamp)},${q(stamp)});`);
    statements.push(`INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_fingerprint) VALUES(${q(runId)},${q(row.id)},${q(row.name)},'Synthetic QA',${q(status)},100,'Explicit local projection fixture',${q(hash)},${status==='pass'?q(evidenceId):'NULL'},${q(stamp)},'qa',${q(row.fingerprint)});
      UPDATE evidence_automation_rules SET last_run_id=${q(runId)},last_status=${q(status)},last_run_at=${q(stamp)},last_evidence_at=${q(stamp)} WHERE id=${q(row.id)};`);
    row.runId=runId;row.evidenceId=status==='pass'?evidenceId:null;
  }
  const file=`${out}/current-assessment-fixture.sql`;await fs.writeFile(file,statements.join('\n'));
  execFileSync('npx',['wrangler','d1','execute','DB','--local','--config','wrangler.d1.jsonc','--file',file],{stdio:'pipe',timeout:60000});
  return receipts;
}
