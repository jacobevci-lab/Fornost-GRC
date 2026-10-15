import type { DatabaseSync } from 'node:sqlite';
import { assessmentFingerprint } from '../../app/evidence/assessment-lineage';

/** Synthetic persisted receipts for read-model fixtures only; never a migration/backfill. */
export async function seedAssessmentReceipt(sqlite:DatabaseSync,ruleId:string,now:Date,runId=`RUN-${ruleId}`,status='pass') {
  const rule=sqlite.prepare('SELECT * FROM evidence_automation_rules WHERE id=?').get(ruleId)!;
  sqlite.prepare("INSERT OR IGNORE INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES(?,'Fixture','Custom','Custom','rest-json','{}',?,?,'qa')").run(rule.source_id,now.toISOString(),now.toISOString());
  const source=sqlite.prepare('SELECT * FROM evidence_automation_sources WHERE id=?').get(rule.source_id)!;
  const fingerprint=await assessmentFingerprint(rule,source),id=`EVD-AUTO-${runId}`;
  const data={controlRef:rule.control_refs,status:'Approved',validationStatus:status,responseHash:'a'.repeat(64),collectedAt:now.toISOString(),freshUntil:new Date(now.getTime()+Number(rule.freshness_hours)*3600000).toISOString(),assessmentFingerprint:fingerprint,automationRuleId:ruleId,automationRunId:runId};
  sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id,'Kanıtlar',JSON.stringify(data),now.toISOString(),now.toISOString());
  sqlite.prepare("INSERT INTO evidence_automation_runs(id,rule_id,rule_name,source_name,status,score,detail,response_hash,evidence_id,created_at,actor,assessment_fingerprint) VALUES(?,?,?,'Fixture',?,100,'Synthetic fixture',?,?,?,'qa',?)").run(runId,ruleId,rule.name,status,data.responseHash,id,now.toISOString(),fingerprint);
  sqlite.prepare('UPDATE evidence_automation_rules SET last_run_id=?,last_status=?,last_evidence_at=? WHERE id=?').run(runId,status,now.toISOString(),ruleId);
  return {runId,id,data};
}
