import type { Actor } from '../api/auth/security';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { joinWorkflowGuards, prepareWorkflowSelection } from '../workflow-selection-store';
import { canScheduleFinding, FindingDeadlineError, validateFindingDeadline, type FindingDeadlineContext } from './finding-deadline';
import { validReviewDate } from './review-schedule';

type Row=Record<string,string|number|null>;
async function snapshot(db:D1Database, findingId:string, actor:Actor) {
  const finding=await db.prepare('SELECT * FROM third_party_findings WHERE id=?').bind(findingId).first<Row>();
  const profile=finding&&await db.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(finding.vendor_id).first<Row>();
  const assessment=finding&&await db.prepare('SELECT * FROM third_party_assessments WHERE id=? AND vendor_id=?').bind(finding.assessment_id,finding.vendor_id).first<Row>();
  if (!finding||!profile||!assessment||!validReviewDate(finding.due_date)||!Number.isSafeInteger(assessment.cycle_number)||Number(assessment.cycle_number)<1) throw new FindingDeadlineError('TPRM_DEADLINE_SOURCE_CHANGED',404);
  const f={id:String(finding.id),vendorId:String(finding.vendor_id),assessmentId:String(finding.assessment_id),title:String(finding.title),owner:String(finding.owner),status:String(finding.status),severity:String(finding.severity),dueDate:String(finding.due_date),actionNote:String(finding.action_note||''),createdBy:String(finding.created_by),submittedBy:finding.submitted_by as string|null};
  const p={vendorId:String(profile.vendor_id),name:String(profile.name),reviewer:String(profile.reviewer),createdBy:String(profile.created_by),businessOwner:String(profile.business_owner),riskOwner:String(profile.risk_owner),status:String(profile.status),contractEnd:String(profile.contract_end)};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({finding,profile,assessment})));
  const context:FindingDeadlineContext={finding:f,profile:p,cycleNumber:Number(assessment.cycle_number),token:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),canSchedule:canScheduleFinding(actor,f,p),today:new Date().toISOString().slice(0,10)};
  return {finding,profile,assessment,context};
}
export async function readFindingDeadline(db:D1Database, findingId:string, actor:Actor) {return (await snapshot(db,findingId,actor)).context}
function rowGuard(table:'third_party_profiles'|'third_party_assessments', row:Row) {
  const columns=Object.keys(row);
  if(columns.some(key=>!/^[a-z_][a-z0-9_]*$/.test(key)))throw new FindingDeadlineError('TPRM_DEADLINE_SOURCE_CHANGED',409);
  return {sql:`EXISTS (SELECT 1 FROM ${table} WHERE ${columns.map(key=>`${key} IS ?`).join(' AND ')})`,values:columns.map(key=>row[key])};
}
export async function rescheduleFinding(env:{DB:D1Database}, actor:Actor, input:Record<string,unknown>) {
  if(actor.role!=='Admin')throw new FindingDeadlineError('TPRM_DEADLINE_ACCESS',403);
  if(typeof input.findingId!=='string'||!input.findingId.trim()||input.findingId.length>100||input.findingId.includes('\u0000'))throw new FindingDeadlineError('TPRM_DEADLINE_INPUT');
  const source=await snapshot(env.DB,input.findingId,actor);
  if(input.contextToken!==source.context.token)throw new FindingDeadlineError('TPRM_DEADLINE_SOURCE_CHANGED',409);
  if(!source.context.canSchedule)throw new FindingDeadlineError('TPRM_DEADLINE_ACCESS',403);
  const value=validateFindingDeadline(input,String(source.finding.due_date),source.context.today);
  const identity=await prepareWorkflowSelection(env,actor,{assignmentMode:'directory',account:actor.email},{account:'reviewer'},false,[]);
  const guard=joinWorkflowGuards(identity.guard,rowGuard('third_party_profiles',source.profile),rowGuard('third_party_assessments',source.assessment));
  const now=nextLifecycleStamp(source.finding.updated_at),eventId=crypto.randomUUID();
  await commitLifecycle(env.DB,lifecycleClaim(env.DB,'third_party_findings','due_date=?,updated_by=?,updated_at=?',[value.nextDate,actor.email,now],source.finding,guard),[
    lifecycleInsert(env.DB,'third_party_events',{id:eventId,vendor_id:source.finding.vendor_id,assessment_id:source.finding.assessment_id,finding_id:source.finding.id,action:'finding-deadline-changed',detail:JSON.stringify({schema:'tprm-finding-deadline-v1',previousDate:source.finding.due_date,nextDate:value.nextDate,note:value.note,owner:source.finding.owner,status:source.finding.status,severity:source.finding.severity,cycleNumber:source.context.cycleNumber,wasOverdue:String(source.finding.due_date)<source.context.today}),actor:actor.email,created_at:now}),
  ]);
  return {ok:true,eventId};
}
