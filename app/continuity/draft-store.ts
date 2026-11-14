import type { Actor } from '../api/auth/security';
import { validateContinuityPlan } from './domain';
import { independentPlanReviewer, publicContinuityPlan } from './plan';
import { commitReferencedLifecycle } from '../enterprise-reference-intake';
import { canonicalCoreReferenceValues, coreReferenceGuard } from '../core-reference-write';
import { lifecycleClaim, lifecycleInsert, LifecycleConflict, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { prepareWorkflowSelection, joinWorkflowGuards } from '../workflow-selection-store';

export class PlanDraftError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
type Row = Record<string,string|number|null>;
export async function changePlanDraft(env: {DB:D1Database}, actor: Actor, input: Record<string,unknown>) {
  const action=String(input.action), id=String(input.planId||'');
  const row=await env.DB.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').bind(id).first<Row>();
  if(!row) throw new PlanDraftError('Plan bulunamadı.',404);
  if(actor.role==='Viewer') throw new PlanDraftError('Yazma yetkisi gerekir.',403);
  if(typeof input.expectedUpdatedAt!=='string'||input.expectedUpdatedAt!==row.updated_at) throw new LifecycleConflict();
  const reviewer=independentPlanReviewer(publicContinuityPlan(row),actor), email=actor.email.toLowerCase();
  const maker=actor.role==='Admin'||[row.owner,row.crisis_lead,row.created_by].some(v=>String(v).toLowerCase()===email);
  const returning=action==='return-plan';
  if(returning?!reviewer:(!maker||email===String(row.reviewer).toLowerCase())) throw new PlanDraftError('Bu işlem için atanmış plan ekibi veya bağımsız inceleyen gerekir.',403);
  if(row.status!==(returning?'submitted':'draft')) throw new PlanDraftError('Planın güncel durumu bu işleme uygun değil.',409);
  let fields: Row = {}, note=String(input.note||'').trim();
  let selection: Awaited<ReturnType<typeof prepareWorkflowSelection>>|undefined;
  if(action==='edit-plan') {
    selection=await prepareWorkflowSelection(env,actor,{...input,assignmentMode:'directory'},{owner:'writer',reviewer:'reviewer',crisisLead:'writer'},false);
    const x=validateContinuityPlan(selection.body);
    if([row.created_by,actor.email].includes(x.reviewer)) throw new PlanDraftError('Hazırlayan kişi bağımsız inceleyen olamaz.');
    fields={name:x.name,process:x.process,bia_ref:x.biaRef,criticality:x.criticality,owner:x.owner,reviewer:x.reviewer,crisis_lead:x.crisisLead,
      rto_hours:x.rtoHours,rpo_hours:x.rpoHours,mtpd_hours:x.mtpdHours,dependencies:x.dependencies,recovery_strategy:x.recoveryStrategy,
      communication_plan:x.communicationPlan,alternate_site:x.alternateSite||null,supplier_dependencies:x.supplierDependencies||null,
      minimum_staff:x.minimumStaff,review_date:x.reviewDate};
    note='Draft updated';
  } else {
    const phrases:Record<string,string>={'submit-plan':'PLANI İNCELEMEYE GÖNDER','return-plan':'PLANI TASLAĞA İADE ET','cancel-plan':'PLANI İPTAL ET'};
    if(!phrases[action]||input.confirmation!==phrases[action]||note.length<10||note.length>2000) throw new PlanDraftError('Onay ifadesi ve 10–2000 karakter gerekçe zorunludur.');
    if(action==='submit-plan') {
      validateContinuityPlan(publicContinuityPlan(row));
      selection=await prepareWorkflowSelection(env,actor,{assignmentMode:'directory',owner:row.owner,reviewer:row.reviewer,crisisLead:row.crisis_lead},{owner:'writer',reviewer:'reviewer',crisisLead:'writer'},false);
      if([row.created_by,row.owner,row.crisis_lead,email].includes(String(row.reviewer))) throw new PlanDraftError('Bağımsız inceleyen hazırlayan ekipten farklı olmalıdır.');
    }
    fields.status=action==='submit-plan'?'submitted':returning?'draft':'cancelled';
  }
  const stamp=nextLifecycleStamp(row.updated_at);
  const updates={...fields,updated_by:email,updated_at:stamp};
  const refs=coreReferenceGuard(canonicalCoreReferenceValues(fields.bia_ref??row.bia_ref).map(value=>({sourceId:id,field:'bia_ref',value,modules:['BIA']})));
  const guard=joinWorkflowGuards(refs,selection?.guard,{sql:"NOT EXISTS(SELECT 1 FROM enterprise_continuity_exercises WHERE plan_id=?) AND NOT EXISTS(SELECT 1 FROM enterprise_continuity_gaps WHERE plan_id=?)",values:[id,id]});
  await commitReferencedLifecycle(env.DB,lifecycleClaim(env.DB,'enterprise_continuity_plans',Object.keys(updates).map(k=>`${k}=?`).join(','),Object.values(updates),row,guard),[
    lifecycleInsert(env.DB,'enterprise_continuity_events',{id:`BCE-${crypto.randomUUID()}`,entity_type:'plan',entity_id:id,action:action.replace('-plan',''),detail:JSON.stringify({note,before:publicContinuityPlan(row),after:publicContinuityPlan({...row,...updates})}),actor:email,created_at:stamp}),
  ],refs);
  return {message:'Plan güncellendi.',id};
}
