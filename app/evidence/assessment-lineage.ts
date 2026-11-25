import type { RetestReason } from '../assurance-retest';
import { normalizeEvidenceControlRef, splitEvidenceControlRefs } from './versioning';

// Only assessment inputs participate. Display names, diagnostics and previous
// results do not change the meaning of a test. Revision also detects A -> B -> A.
export const assessmentRuleKeys = ['id','source_id','control_refs','json_path','operator','expected','schedule','enabled','template_id','template_version','freshness_hours','failure_threshold','auto_finding','remediation_owner','remediation_due_days','assessment_revision'] as const;
const sourceKeys = ['id','driver','enabled','config_json','secret_ciphertext'] as const;
export async function assessmentFingerprint(rule: object, source: object) {
  const values = (row: object, keys: readonly string[]) => keys.map(key => (row as Record<string,unknown>)[key] ?? null);
  const input = JSON.stringify(['fornost-assessment-v1',values(rule,assessmentRuleKeys),values(source,sourceKeys)]);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function retestConfigurationReason(rule: (object & { enabled:number; control_refs:string }) | null, source: (object & { enabled:number }) | null, fingerprint: string | null | undefined, targetControl?:string):Promise<RetestReason|null> {
  if(!rule || !source || !rule.enabled || !source.enabled)return 'source-unavailable';
  if(targetControl!==undefined){
    const target=normalizeEvidenceControlRef(targetControl);
    if(!target || !splitEvidenceControlRefs(rule.control_refs).some(ref=>normalizeEvidenceControlRef(ref)===target))return 'control-scope-changed';
  }
  if(!/^[a-f0-9]{64}$/.test(fingerprint||''))return 'configuration-unverified';
  return fingerprint===await assessmentFingerprint(rule,source)?null:'configuration-changed';
}

const ruleFields = assessmentRuleKeys.filter(key=>key!=='id' && key!=='assessment_revision');
export const assessmentRevisionTriggers = [
  `CREATE TRIGGER IF NOT EXISTS evidence_rule_assessment_revision AFTER UPDATE OF ${ruleFields.join(',')} ON evidence_automation_rules
    WHEN ${ruleFields.map(key=>`NEW.${key} IS NOT OLD.${key}`).join(' OR ')}
    BEGIN UPDATE evidence_automation_rules SET assessment_revision=assessment_revision+1 WHERE id=NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS evidence_source_assessment_revision AFTER UPDATE OF driver,enabled,config_json,secret_ciphertext ON evidence_automation_sources
    WHEN NEW.driver IS NOT OLD.driver OR NEW.enabled IS NOT OLD.enabled OR NEW.config_json IS NOT OLD.config_json OR NEW.secret_ciphertext IS NOT OLD.secret_ciphertext
    BEGIN UPDATE evidence_automation_rules SET assessment_revision=assessment_revision+1 WHERE source_id=NEW.id; END`,
];

export async function ensureAssessmentLineageSchema(db:D1Database) {
  for (const [table,name,definition] of [
    ['evidence_automation_rules','assessment_revision','INTEGER NOT NULL DEFAULT 0'],
    ['evidence_automation_runs','assessment_fingerprint','TEXT'],
  ]) {
    const info=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
    if(info.results.some(column=>column.name===name))continue;
    try {await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();}
    catch(error) {const current=await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();if(!current.results.some(column=>column.name===name))throw error;}
  }
  for(const sql of assessmentRevisionTriggers)await db.prepare(sql).run();
}
