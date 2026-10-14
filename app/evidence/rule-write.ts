import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from '../core-reference-write';

type RuleInput={
 id:string;name:string;sourceId:string;controlRefs:string;jsonPath:string;operator:string;expected:string;schedule:string;
 now:string;actor:string;freshnessHours:number;failureThreshold:number;autoFinding:boolean;owner:string;
 remediationDueDays:number;nextRunAt:string|null;templateId?:string;templateVersion?:number;
};

/** Validate canonical targets inside the INSERT so deletion cannot race rule creation. */
export async function insertAutomationRule(db:D1Database,input:RuleInput){
 const guard=coreReferenceGuard(canonicalCoreReferenceValues(input.controlRefs).map(value=>({
  sourceId:input.id,field:'control_refs',value,modules:['Kontroller','Uyum'],
 })));
 const result=await db.prepare(`INSERT INTO evidence_automation_rules(
 id,name,source_id,control_refs,json_path,operator,expected,schedule,enabled,created_at,updated_at,updated_by,
 freshness_hours,failure_threshold,consecutive_failures,auto_finding,remediation_owner,remediation_due_days,next_run_at,template_id,template_version)
 SELECT ?,?,?,?,?,?,?,?,1,?,?,?,?,?,0,?,?,?,?,?,? WHERE ${guard.sql}`)
 .bind(input.id,input.name,input.sourceId,input.controlRefs,input.jsonPath,input.operator,input.expected,input.schedule,
 input.now,input.now,input.actor,input.freshnessHours,input.failureThreshold,input.autoFinding?1:0,input.owner,
 input.remediationDueDays,input.nextRunAt,input.templateId??null,input.templateVersion??null,...guard.values).run();
 if(Number(result.meta?.changes||0)!==1)throw new CoreReferenceUnavailable();
}
