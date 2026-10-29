import type { Actor } from '../api/auth/security';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { joinWorkflowGuards, prepareWorkflowSelection } from '../workflow-selection-store';
import { canReassignReviewer, parseReviewerHandoffRecord, ReviewerHandoffError, validateReviewerHandoff, type ReviewerContext } from './reviewer-handoff';

type Row = Record<string, string | number | null>;
const assessmentColumns = ['id','status','created_by','submitted_by','updated_at'];
const findingColumns = ['id','status','owner','created_by','submitted_by','updated_at','due_date'];
const assessmentWhere = "vendor_id=? AND status IN ('draft','submitted')";
const findingWhere = "vendor_id=? AND status!='closed'";

async function snapshot(db: D1Database, vendorId: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new ReviewerHandoffError('TPRM_REVIEWER_ACCESS',403);
  const profile = await db.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(vendorId).first<Row>();
  if (!profile) throw new ReviewerHandoffError('TPRM_REVIEWER_SOURCE_CHANGED',404);
  const [assessments,findings] = await Promise.all([
    db.prepare(`SELECT ${assessmentColumns.join(',')} FROM third_party_assessments WHERE ${assessmentWhere} ORDER BY id LIMIT 2001`).bind(vendorId).all<Row>(),
    db.prepare(`SELECT ${findingColumns.join(',')} FROM third_party_findings WHERE ${findingWhere} ORDER BY id LIMIT 2001`).bind(vendorId).all<Row>(),
  ]);
  if (assessments.results.length > 2000 || findings.results.length > 2000) throw new ReviewerHandoffError('TPRM_REVIEWER_LIMIT',409);
  const counts = { activeAssessments: assessments.results.length, submittedAssessments: assessments.results.filter(row => row.status === 'submitted').length, openFindings: findings.results.length, verificationFindings: findings.results.filter(row => row.status === 'verification').length };
  const exclusions = [...new Set([actor.email,profile.reviewer,profile.created_by,profile.business_owner,profile.risk_owner,...assessments.results.flatMap(row => [row.created_by,row.submitted_by]),...findings.results.flatMap(row => [row.owner,row.created_by,row.submitted_by])].filter((value): value is string => typeof value === 'string' && Boolean(value)).map(value => value.toLowerCase()))].sort();
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({ profile, assessments:assessments.results, findings:findings.results })));
  const token = Array.from(new Uint8Array(bytes),value => value.toString(16).padStart(2,'0')).join('');
  const context: ReviewerContext = { vendorId, name:String(profile.name), reviewer:String(profile.reviewer), revision:String(profile.updated_at), status:String(profile.status), token, exclusions, counts };
  return { profile, assessments:assessments.results, findings:findings.results, context };
}

export async function readReviewerContext(db: D1Database, vendorId: string, actor: Actor) { return (await snapshot(db,vendorId,actor)).context; }

/** Internal table/column constants only. Guard both membership and every inspected work field. */
function workGuard(table: string, where: string, columns: string[], rows: Row[], vendorId: string) {
  return { sql:`(SELECT COUNT(*) FROM ${table} WHERE ${where})=? AND NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE NOT EXISTS (SELECT 1 FROM ${table} w WHERE w.vendor_id=? AND ${columns.map(column => `w.${column} IS json_extract(s.value,'$.${column}')`).join(' AND ')}))`, values:[vendorId,rows.length,JSON.stringify(rows),vendorId] };
}

export async function reassignSupplierReviewer(env: { DB: D1Database }, actor: Actor, input: Record<string, unknown>) {
  if (actor.role !== 'Admin') throw new ReviewerHandoffError('TPRM_REVIEWER_ACCESS',403);
  const value = validateReviewerHandoff(input), source = await snapshot(env.DB,value.vendorId,actor);
  if (!canReassignReviewer(source.context.status,actor.role)) throw new ReviewerHandoffError('TPRM_REVIEWER_ACCESS',403);
  if (value.expectedRevision !== source.context.revision || value.previousReviewer !== source.context.reviewer || value.token !== source.context.token) throw new ReviewerHandoffError('TPRM_REVIEWER_SOURCE_CHANGED',409);
  const selection = await prepareWorkflowSelection(env,actor,input,{reviewer:'reviewer'},false,source.context.exclusions);
  const reviewer = String(selection.body.reviewer), now = nextLifecycleStamp(source.profile.updated_at), eventId = crypto.randomUUID();
  const guard = joinWorkflowGuards(selection.guard,workGuard('third_party_assessments',assessmentWhere,assessmentColumns,source.assessments,value.vendorId),workGuard('third_party_findings',findingWhere,findingColumns,source.findings,value.vendorId));
  await commitLifecycle(env.DB,lifecycleClaim(env.DB,'third_party_profiles','reviewer=?,updated_by=?,updated_at=?',[reviewer,actor.email,now],source.profile,guard,'vendor_id'),[
    lifecycleInsert(env.DB,'third_party_events',{ id:eventId,vendor_id:value.vendorId,assessment_id:null,finding_id:null,action:'vendor-reviewer-reassigned',detail:JSON.stringify({schema:'tprm-reviewer-handoff-v1',previousReviewer:source.context.reviewer,reviewer,note:value.note,counts:source.context.counts}),actor:actor.email,created_at:now }),
  ]);
  return { ok:true, eventId, reviewer };
}

export async function readReviewerHistory(db: D1Database, vendorId: string, page: number) {
  if (!await db.prepare('SELECT vendor_id FROM third_party_profiles WHERE vendor_id=?').bind(vendorId).first()) throw new ReviewerHandoffError('TPRM_REVIEWER_SOURCE_CHANGED',404);
  const result = await db.prepare("SELECT id,actor,created_at,detail FROM third_party_events WHERE vendor_id=? AND action='vendor-reviewer-reassigned' ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?").bind(vendorId,page*50).all<Record<string,string>>();
  return { vendorId,page,rows:result.results.slice(0,50).map(row => ({id:row.id,actor:row.actor,createdAt:row.created_at,detail:parseReviewerHandoffRecord(row.detail)})),hasMore:result.results.length>50 };
}
