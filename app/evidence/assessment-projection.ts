import { isAutomatedEvidence } from './automation-identity';
export { isAutomatedEvidence } from './automation-identity';
import { assessRetestRun, parseAssuranceObject, type RetestRun, type RetestReason } from '../assurance-retest';
import { evaluateEvidenceEligibility } from './eligibility';
import { normalizeEvidenceControlRef, splitEvidenceControlRefs } from './versioning';
import { assessmentRuleKeys, retestConfigurationReason } from './assessment-lineage';

export type AssessmentState = 'current' | RetestReason | 'assessment-unavailable';
type AssessmentRule = Record<string,unknown> & {id:string;enabled:number;control_refs:string;freshness_hours:number};
type AssessmentSource = Record<string,unknown> & {enabled:number};
type AssessmentRun = RetestRun & {rule_id:string};
export type AssessmentJoin = { assessment_rule:string|null; assessment_source:string|null; assessment_run:string|null; assessment_evidence:string|null; assessment_run_links:number };
const jsonRow=(alias:string,keys:readonly string[])=>`CASE WHEN ${alias}.id IS NOT NULL THEN json_object(${keys.map(key=>`'${key}',${alias}.${key}`).join(',')}) END`;
// Fixed identifiers only; credentials stay in the internal projection and are never returned.
const evidenceKeys=['validationStatus','responseHash','assessmentFingerprint','collectedAt','freshUntil','automationRuleId','automationRunId','status','reviewStatus','expiresAt','controlRef','requirementRef'] as const;
const evidenceMetadata=(data:Record<string,unknown>|null)=>data?Object.fromEntries(evidenceKeys.map(key=>[key,data[key]??null])):null;
const evidenceJson=`CASE WHEN json_valid(e.data_json) THEN json_object(${evidenceKeys.map(key=>`'${key}',json_extract(e.data_json,'$.${key}')`).join(',')}) END`;
export const assessmentJoinColumns = `${jsonRow('r',assessmentRuleKeys)} assessment_rule,${jsonRow('s',['id','driver','enabled','config_json','secret_ciphertext'])} assessment_source,${jsonRow('run',['id','rule_id','status','evidence_id','created_at','response_hash','detail','error_code','assessment_fingerprint'])} assessment_run,${evidenceJson} assessment_evidence,(SELECT COUNT(*) FROM evidence_automation_runs linked WHERE linked.evidence_id=run.evidence_id) assessment_run_links`;
export const assessmentRunJoins = "LEFT JOIN evidence_automation_rules r ON r.id=run.rule_id LEFT JOIN evidence_automation_sources s ON s.id=r.source_id LEFT JOIN simple_grc_records e ON e.id=run.evidence_id AND e.module='Kanıtlar'";

export async function assessJoinedRun(row:AssessmentJoin,now:Date,targetControl?:string) {
  const rule=parseAssuranceObject(row.assessment_rule) as AssessmentRule|null;
  const source=parseAssuranceObject(row.assessment_source) as AssessmentSource|null;
  const run=parseAssuranceObject(row.assessment_run) as AssessmentRun|null;
  const reason=await retestConfigurationReason(rule,source,run?.assessment_fingerprint,targetControl);
  if(reason)return {status:'error' as const,reason};
  if(!run || run.rule_id!==rule?.id)return {status:'error' as const,reason:'configuration-unverified' as const};
  const evidence=parseAssuranceObject(row.assessment_evidence);
  if(evidence && ((evidence.automationRunId && evidence.automationRunId!==run.id) || (evidence.automationRuleId && evidence.automationRuleId!==run.rule_id)))return {status:'error' as const,reason:'evidence-mismatch' as const};
  // Governed re-test recovery requires fresh proof; current evidence remains eligible
  // through its expiring window, which the dashboard separately flags for attention.
  const assessment=assessRetestRun(run,row.assessment_evidence,Number(rule?.freshness_hours),now,{allowExpiring:targetControl===undefined});
  if(assessment.status!=='pass')return assessment;
  if(row.assessment_run_links!==1)return {status:'error' as const,reason:'evidence-mismatch' as const};
  const refs=(value:unknown)=>[...new Set(splitEvidenceControlRefs(String(value||'')).map(normalizeEvidenceControlRef))].sort();
  const expected=refs(rule!.control_refs),actual=refs(evidence!.controlRef);
  if(!expected.length || JSON.stringify(expected)!==JSON.stringify(actual) || refs(evidence!.requirementRef).some(ref=>!expected.includes(ref)))return {status:'error' as const,reason:'evidence-mismatch' as const};
  const eligibility=evaluateEvidenceEligibility(evidence!,now);
  if(!eligibility.current)return {status:'error' as const,reason:eligibility.expired?'evidence-stale' as const:'evidence-mismatch' as const};
  return assessment;
}

/** Read-only: mark eligibility at this evaluation without rewriting any evidence history. */
export async function projectAutomatedEvidence<T extends {id:string;data:Record<string,unknown>}>(db:D1Database,rows:T[],now:Date):Promise<{available:boolean;rows:Array<T & {data:Record<string,unknown> & {automationAssessment?:AssessmentState}}>} > {
  const candidates=rows.filter(isAutomatedEvidence), states=new Map<string,AssessmentState>();
  let available=true;
  for(let offset=0;offset<candidates.length;offset+=80){
    const group=candidates.slice(offset,offset+80);
    try{
      // One statement observes run, current settings and canonical evidence together.
      // GROUP BY bounds output to the requested IDs; duplicate run links fail closed.
      const result=await db.prepare(`SELECT e.id,COUNT(run.id) run_count,${assessmentJoinColumns} FROM simple_grc_records e
        LEFT JOIN evidence_automation_runs run ON run.evidence_id=e.id
        LEFT JOIN evidence_automation_rules r ON r.id=run.rule_id LEFT JOIN evidence_automation_sources s ON s.id=r.source_id
        WHERE e.module='Kanıtlar' AND e.id IN (${group.map(()=>'?').join(',')}) GROUP BY e.id`)
        .bind(...group.map(row=>row.id)).all<AssessmentJoin & {id:string;run_count:number}>();
      const byId=new Map(result.results.map(row=>[row.id,row]));
      for(const original of group){
        const row=byId.get(original.id);
        if(!row || row.run_count!==1){states.set(original.id,'configuration-unverified');continue;}
        if(JSON.stringify(parseAssuranceObject(row.assessment_evidence))!==JSON.stringify(evidenceMetadata(original.data))){states.set(original.id,'evidence-mismatch');continue;}
        const result=await assessJoinedRun(row,now);states.set(original.id,result.status==='pass'?'current':result.reason);
      }
    }catch{available=false;for(const row of group)states.set(row.id,'assessment-unavailable');}
  }
  return {available,rows:rows.map(row=>states.has(row.id)?{...row,data:{...row.data,automationAssessment:states.get(row.id)}}:row)};
}
