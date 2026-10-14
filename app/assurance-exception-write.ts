import {type AssuranceExceptionProposal} from './assurance-governance';
import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from './core-reference-write';

/** Check canonical targets in the INSERT, so a concurrent deletion cannot orphan a new request. */
export async function insertAssuranceException(db:D1Database,id:string,proposal:AssuranceExceptionProposal,actor:string,stamp:string){
 const fields=[
  {field:'control_ref',value:proposal.controlRef,modules:['Kontroller','Uyum']},
  {field:'risk_ref',value:proposal.riskRef,modules:['Risk Assessment']},
  {field:'evidence_reference',value:proposal.evidenceReference,modules:['Kanıtlar']},
 ];
 const guard=coreReferenceGuard(fields.flatMap(({field,value,modules})=>canonicalCoreReferenceValues(value).map(value=>({sourceId:id,field,value,modules}))));
 const result=await db.prepare(`INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at,retest_required,lifecycle_updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,'pending-review',?,?,0,? WHERE ${guard.sql}`)
 .bind(id,proposal.findingId,proposal.ruleId,proposal.controlRef,proposal.riskRef,proposal.reason,proposal.expiresAt,proposal.evidenceReference,proposal.evidenceSha256,actor,stamp,stamp,...guard.values).run();
 if(Number(result.meta?.changes||0)!==1)throw new CoreReferenceUnavailable();
}
