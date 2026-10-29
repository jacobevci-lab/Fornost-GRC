import type { Actor } from '../api/auth/security';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { joinWorkflowGuards, prepareWorkflowSelection } from '../workflow-selection-store';
import { assessmentDraft, AssessmentCorrectionError, parseCorrectionRecord, validateCorrection, type AssessmentSnapshot, type CorrectionContext, type CorrectionMode } from './assessment-correction';

type Row = Record<string,string|number|null>;
function assessmentSnapshot(row: Row): AssessmentSnapshot {
  return { id:String(row.id), cycleNumber:Number(row.cycle_number), status:String(row.status), revision:String(row.updated_at), createdBy:String(row.created_by), updatedBy:String(row.updated_by),
    submittedBy:row.submitted_by as string|null, submittedAt:row.submitted_at as string|null, evidenceReference:row.evidence_reference as string|null, evidenceSha256:row.evidence_sha256 as string|null,
    impact:Number(row.impact), likelihood:Number(row.likelihood), controlMaturity:Number(row.control_maturity), questionnaire:JSON.parse(String(row.questionnaire_json)), coverage:Number(row.coverage), inherentScore:Number(row.inherent_score), residualScore:Number(row.residual_score), riskTier:String(row.risk_tier), criticalGaps:JSON.parse(String(row.critical_gaps_json)), treatmentPlan:String(row.treatment_plan) };
}
async function snapshot(db: D1Database, assessmentId: string, actor: Actor) {
  const assessment = await db.prepare('SELECT * FROM third_party_assessments WHERE id=?').bind(assessmentId).first<Row>();
  const profile = assessment && await db.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(assessment.vendor_id).first<Row>();
  if (!assessment || !profile) throw new AssessmentCorrectionError('TPRM_CORRECTION_SOURCE_CHANGED',404);
  const email = actor.email.toLowerCase(), same = (value: unknown) => String(value || '').toLowerCase() === email;
  const canRevise = ['Admin','Editor'].includes(actor.role) && same(profile.risk_owner) && !same(profile.reviewer) && assessment.status === 'draft' && ['onboarding','reassessment'].includes(String(profile.status));
  const canReturn = actor.role === 'Admin' && same(profile.reviewer) && ![profile.created_by,profile.business_owner,profile.risk_owner,assessment.created_by,assessment.submitted_by].some(same) && assessment.status === 'submitted' && profile.status === 'in-review';
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({ profile, assessment })));
  const context: CorrectionContext = { assessment:assessmentSnapshot(assessment), token:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''), canRevise,canReturn,
    profile:{vendorId:String(profile.vendor_id),name:String(profile.name),service:String(profile.service),riskOwner:String(profile.risk_owner),reviewer:String(profile.reviewer),status:String(profile.status),revision:String(profile.updated_at),nextReview:String(profile.next_review),contractEnd:String(profile.contract_end)} };
  return { assessment,profile,context };
}
export async function readAssessmentCorrection(db: D1Database, assessmentId: string, actor: Actor) { return (await snapshot(db,assessmentId,actor)).context; }

export async function correctSupplierAssessment(env: {DB:D1Database}, actor: Actor, input: Record<string,unknown>, mode: CorrectionMode) {
  if (!['Admin','Editor'].includes(actor.role)) throw new AssessmentCorrectionError('TPRM_CORRECTION_ACCESS',403);
  if (typeof input.assessmentId !== 'string' || !input.assessmentId || input.assessmentId.length>100) throw new AssessmentCorrectionError('TPRM_CORRECTION_INPUT');
  const source = await snapshot(env.DB,input.assessmentId,actor), value = validateCorrection(input,mode,String(source.profile.vendor_id));
  if (input.contextToken !== source.context.token) throw new AssessmentCorrectionError('TPRM_CORRECTION_SOURCE_CHANGED',409);
  if (!(mode === 'return' ? source.context.canReturn : source.context.canRevise)) throw new AssessmentCorrectionError('TPRM_CORRECTION_ACCESS',403);
  // Reuse the existing active full-access identity guard; this does not change an assignment.
  const identity = await prepareWorkflowSelection(env,actor,{assignmentMode:'directory',account:actor.email},{account:'writer'});
  const now = nextLifecycleStamp(source.assessment.updated_at), eventId = crypto.randomUUID();
  const updates: Row = { updated_by:actor.email,updated_at:now };
  if (mode === 'return') updates.status='draft';
  else if (value.content) {
    const c=value.content;
    Object.assign(updates,{impact:c.impact,likelihood:c.likelihood,control_maturity:c.controlMaturity,questionnaire_json:JSON.stringify(c.questionnaire),coverage:c.coverage,inherent_score:c.inherentScore,residual_score:c.residualScore,risk_tier:c.riskTier,critical_gaps_json:JSON.stringify(c.criticalGaps),treatment_plan:c.treatmentPlan});
    if (JSON.stringify(assessmentDraft(assessmentSnapshot({...source.assessment,...updates})))===JSON.stringify(assessmentDraft(source.context.assessment))) throw new AssessmentCorrectionError('TPRM_CORRECTION_UNCHANGED');
  }
  const columns=Object.keys(source.profile);
  if (columns.some(key=>!/^[a-z_]+$/.test(key))) throw new AssessmentCorrectionError('TPRM_CORRECTION_SOURCE_CHANGED',409);
  const guard=joinWorkflowGuards(identity.guard,{sql:`EXISTS (SELECT 1 FROM third_party_profiles p WHERE ${columns.map(key=>`p.${key} IS ?`).join(' AND ')})`,values:columns.map(key=>source.profile[key])});
  await commitLifecycle(env.DB,lifecycleClaim(env.DB,'third_party_assessments',Object.keys(updates).map(key=>`${key}=?`).join(','),Object.values(updates),source.assessment,guard),[
    ...(mode==='return'?[env.DB.prepare("UPDATE third_party_profiles SET status=?,updated_by=?,updated_at=? WHERE vendor_id=? AND changes()=1").bind(Number(source.assessment.cycle_number)>1?'reassessment':'onboarding',actor.email,nextLifecycleStamp(source.profile.updated_at),source.profile.vendor_id)]:[]),
    lifecycleInsert(env.DB,'third_party_events',{id:eventId,vendor_id:source.profile.vendor_id,assessment_id:input.assessmentId,finding_id:null,action:mode==='return'?'assessment-returned':'assessment-revised',detail:JSON.stringify({schema:'tprm-assessment-correction-v1',mode,note:value.note,before:source.context.assessment,after:assessmentSnapshot({...source.assessment,...updates})}),actor:actor.email,created_at:now}),
  ]);
  return {ok:true,eventId};
}

export async function readAssessmentCorrectionHistory(db: D1Database, assessmentId: string, page: number) {
  const assessment=await db.prepare('SELECT vendor_id FROM third_party_assessments WHERE id=?').bind(assessmentId).first<{vendor_id:string}>();
  if (!assessment) throw new AssessmentCorrectionError('TPRM_CORRECTION_SOURCE_CHANGED',404);
  const rows=await db.prepare("SELECT id,actor,created_at,detail FROM third_party_events WHERE vendor_id=? AND assessment_id=? AND action IN ('assessment-returned','assessment-revised') ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?").bind(assessment.vendor_id,assessmentId,page*20).all<Record<string,string>>();
  return {assessmentId,page,rows:rows.results.slice(0,20).map(row=>({id:row.id,actor:row.actor,createdAt:row.created_at,detail:parseCorrectionRecord(row.detail)})),hasMore:rows.results.length>20};
}
