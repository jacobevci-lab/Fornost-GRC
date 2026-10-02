import {NextRequest,NextResponse} from "next/server";
import {requireRole,type AppRole} from "../../auth/security";
import {clean} from "../../integrations/security";
import {exceptionEffectiveStatus,riskReviewEscalation,validateAssuranceException} from "../../../assurance-governance";
import {ensureAssuranceWorkSchema} from "../../../continuous-assurance-runtime";

import {decideRiskReview,submitRiskReview,riskRevision,riskDecisionContext,riskObject,riskReviewBlocker,RiskReviewError,type RiskReviewRow} from "../../../risk-review-runtime";

import {transitionAssuranceException,reconcileExpiredExceptions,type ExceptionRow} from "../../../assurance-exception-runtime";

import {ensureAssuranceExceptionSchema} from "../../../assurance-exception-schema";

type Env=Record<string,unknown>&{DB:D1Database};
type ReviewRow=RiskReviewRow;
const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_risk_reviews(id TEXT PRIMARY KEY,risk_id TEXT NOT NULL,status TEXT NOT NULL,proposal_json TEXT NOT NULL,submitted_by TEXT NOT NULL,submitted_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT)`,
 `CREATE INDEX IF NOT EXISTS ca_risk_reviews_status_idx ON continuous_assurance_risk_reviews(status,submitted_at)`,
 `CREATE INDEX IF NOT EXISTS ca_risk_reviews_risk_idx ON continuous_assurance_risk_reviews(risk_id,status)`,

];
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
async function ready(db:D1Database){for(const sql of schema)await db.prepare(sql).run();await ensureAssuranceExceptionSchema(db);await ensureAssuranceWorkSchema(db)}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
const today=()=>new Date().toISOString().slice(0,10);
async function counts(db:D1Database,cutoff:string){
 const sourceIssues:string[]=[];
 let pendingWork=0,failedRetest=0,openFindings=0,retestCompleted30d=0,retestFailed30d=0;
 try{const row=await db.prepare("SELECT SUM(CASE WHEN status IN ('pending-review','approved-awaiting-retest') THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status IN ('failed-retest','retest-error') THEN 1 ELSE 0 END) failed,SUM(CASE WHEN action='control-retest' AND status='completed' AND completed_at>=? THEN 1 ELSE 0 END) completed30,SUM(CASE WHEN action='control-retest' AND status IN ('failed-retest','retest-error') AND completed_at>=? THEN 1 ELSE 0 END) failed30 FROM continuous_assurance_work_items").bind(cutoff,cutoff).first<{pending:number;failed:number;completed30:number;failed30:number}>();pendingWork=Number(row?.pending||0);failedRetest=Number(row?.failed||0);retestCompleted30d=Number(row?.completed30||0);retestFailed30d=Number(row?.failed30||0)}catch{sourceIssues.push("work-unavailable")}
 try{const row=await db.prepare("SELECT COUNT(*) n FROM evidence_automation_findings WHERE status!='closed'").first<{n:number}>();openFindings=Number(row?.n||0)}catch{sourceIssues.push("findings-unavailable")}
 return{pendingWork,failedRetest,openFindings,retestCompleted30d,retestFailed30d,sourceIssues};
}

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const env=await runtime();await ready(env.DB);await reconcileExpiredExceptions(env.DB);
 const now=new Date(),nowDay=now.toISOString().slice(0,10),in14=new Date(now.getTime()+14*86_400_000).toISOString().slice(0,10),cutoff30=new Date(now.getTime()-30*86_400_000).toISOString();
 const [reviewsResult,exceptionsResult,risksResult,operational]=await Promise.all([
  env.DB.prepare("SELECT * FROM continuous_assurance_risk_reviews ORDER BY CASE status WHEN 'pending-review' THEN 0 ELSE 1 END,submitted_at DESC,id LIMIT 501").all<ReviewRow>(),
  env.DB.prepare("SELECT * FROM continuous_assurance_exceptions ORDER BY CASE status WHEN 'pending-review' THEN 0 WHEN 'active' THEN 1 WHEN 'expired' THEN 2 WHEN 'revoked' THEN 3 ELSE 4 END,expires_at,submitted_at DESC,id LIMIT 501").all<ExceptionRow>(),
  env.DB.prepare("SELECT r.id,r.data_json,r.updated_at,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Risk Assessment' ORDER BY r.updated_at DESC,r.id LIMIT 2001").all<{id:string;data_json:string;updated_at:string;code:string}>(),
  counts(env.DB,cutoff30),
 ]);
 const issues:string[]=[...operational.sourceIssues];
 if(exceptionsResult.results.some(row=>row.status==="active"&&row.expires_at<nowDay))issues.push("exception-lifecycle-pending");
 if(reviewsResult.results.length>500)issues.push("reviews-incomplete");if(exceptionsResult.results.length>500)issues.push("exceptions-incomplete");if(risksResult.results.length>2000)issues.push("risks-incomplete");
 if(risksResult.results.some(row=>!riskObject(row.data_json)))issues.push("risks-invalid");
 const sourceRisks=risksResult.results.slice(0,2000),riskIndex=new Map(sourceRisks.map(row=>[row.id,row]));
 const risks=await Promise.all(sourceRisks.map(async row=>({id:row.id,code:row.code,data:parse(row.data_json),updatedAt:row.updated_at,context:riskDecisionContext(row,await riskRevision(row))})));
 const reviews=await Promise.all(reviewsResult.results.slice(0,500).map(async row=>{
  const stored=parse(row.proposal_json),{approvalToken:_token,...proposal}=stored;void _token;
  const risk=riskIndex.get(row.risk_id)||null;
  return{id:row.id,riskId:row.risk_id,status:row.status,proposal,currentRisk:risk?riskDecisionContext(risk):null,approvalBlocker:row.status==="pending-review"?await riskReviewBlocker(row,risk):null,submittedBy:row.submitted_by,submittedAt:row.submitted_at,reviewedBy:row.reviewed_by||"",reviewedAt:row.reviewed_at||"",reviewNote:row.review_note||""};
 }));
 const exceptions=exceptionsResult.results.slice(0,500).map(row=>({id:row.id,findingId:row.finding_id,ruleId:row.rule_id,controlRef:row.control_ref,riskRef:row.risk_ref,reason:row.reason,expiresAt:row.expires_at,evidenceReference:row.evidence_reference,evidenceSha256:row.evidence_sha256,status:exceptionEffectiveStatus(row.status,row.expires_at,nowDay),storedStatus:row.status,submittedBy:row.submitted_by,submittedAt:row.submitted_at,reviewedBy:row.reviewed_by||"",reviewedAt:row.reviewed_at||"",reviewNote:row.review_note||"",revokedBy:row.revoked_by||"",revokedAt:row.revoked_at||"",retestRequired:Boolean(row.retest_required),retestWorkItemId:row.retest_work_item_id||"",lifecycleUpdatedAt:row.lifecycle_updated_at||"",retestCompletedAt:row.retest_completed_at||"",retestResultRef:row.retest_result_ref||""}));
 const risksRequiringReview=risks.filter(item=>item.data.residualRiskReviewRequired===true).map(item=>{const requestedAt=String(item.data.riskReviewRequestedAt||item.data.lastReassessedAt||item.updatedAt||""),escalation=riskReviewEscalation(true,requestedAt,now),riskRef=String(item.code||item.data.riskId||item.data.code||item.id);return{id:item.id,riskRef,context:item.context,title:String(item.data.title||item.id),owner:String(item.data.owner||""),riskLevel:String(item.data.riskLevel||item.data.residualRiskLevel||""),assuranceState:String(item.data.assuranceState||"unknown"),lastAssuranceRunRef:String(item.data.lastAssuranceRunRef||""),reason:String(item.data.reassessmentReason||""),requestedAt,reviewAgeDays:escalation.ageDays,reviewUrgency:escalation.state,reminderDue:escalation.reminderDue,escalationDue:escalation.escalationDue}});
 const ages=risksRequiringReview.map(item=>item.reviewAgeDays),reviewRequired=risksRequiringReview.length;
 const effective=risks.filter(item=>item.data.assuranceState==="effective").length,degraded=risks.filter(item=>item.data.assuranceState==="degraded").length,ineffective=risks.filter(item=>item.data.assuranceState==="ineffective").length;
 const activeExceptions=exceptions.filter(item=>item.status==="active").length,expiringExceptions=exceptions.filter(item=>item.status==="active"&&item.expiresAt<=in14).length,expiredExceptions=exceptions.filter(item=>item.status==="expired").length,retestRequiredExceptions=exceptions.filter(item=>item.retestRequired).length;
 const riskReviewOverdue=risksRequiringReview.filter(item=>item.reviewUrgency==="overdue"||item.reviewUrgency==="critical").length,riskReviewCritical=risksRequiringReview.filter(item=>item.reviewUrgency==="critical").length,oldestRiskReviewDays=ages.length?Math.max(...ages):0,avgRiskReviewAgeDays=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length):0;
 const trend30d={riskReviewsSubmitted:reviews.filter(item=>item.submittedAt>=cutoff30).length,riskReviewsApproved:reviews.filter(item=>item.status==="approved"&&item.reviewedAt>=cutoff30).length,exceptionsSubmitted:exceptions.filter(item=>item.submittedAt>=cutoff30).length,exceptionsEnded:exceptions.filter(item=>(item.status==="expired"&&item.lifecycleUpdatedAt>=cutoff30)||(item.status==="revoked"&&item.revokedAt>=cutoff30)).length,retestCompleted:operational.retestCompleted30d,retestFailed:operational.retestFailed30d};
 return json({generatedAt:now.toISOString(),dataQuality:{verified:issues.length===0,issues},riskReviews:reviews,exceptions,risksRequiringReview,trend30d,summary:{reviewRequired,pendingRiskReviews:reviews.filter(item=>item.status==="pending-review").length,riskReviewOverdue,riskReviewCritical,oldestRiskReviewDays,avgRiskReviewAgeDays,activeExceptions,expiringExceptions,expiredExceptions,retestRequiredExceptions,effective,degraded,ineffective,...operational}});
}

export async function POST(req:NextRequest){
 if(Number(req.headers.get("content-length")||0)>131_072)return json({error:"İstek boyutu çok büyük."},413);
 const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,50);
 const reviewActions=new Set(["review-risk","review-exception","revoke-exception"]),roles:AppRole[]=reviewActions.has(action)?["Admin"]:["Admin","Editor"];
 const access=await requireRole(req,roles);if(access.response)return access.response;
 const env=await runtime();await ready(env.DB);const stamp=new Date().toISOString();
 try{
  if(action==="submit-risk-review"){
   return json({ok:true,...await submitRiskReview(env.DB,body,access.actor.email),message:"Risk teklifi bağımsız incelemeye gönderildi."},201);
  }
  if(action==="review-risk"){
   const result=await decideRiskReview(env.DB,body,access.actor.email);
   return json({ok:true,...result,message:result.status==="approved"?"Residual risk bağımsız inceleme ile onaylandı.":"Risk yeniden değerlendirmesi reddedildi."});
  }
  if(action==="create-exception"){
   const proposal=validateAssuranceException(body,today()),id=`CAE-${crypto.randomUUID()}`;await env.DB.prepare("INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at,retest_required,lifecycle_updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pending-review',?,?,0,?)").bind(id,proposal.findingId,proposal.ruleId,proposal.controlRef,proposal.riskRef,proposal.reason,proposal.expiresAt,proposal.evidenceReference,proposal.evidenceSha256,access.actor.email,stamp,stamp).run();return json({ok:true,id,message:"Assurance exception bağımsız onaya gönderildi."},201);
  }
  if(action==="review-exception"){
   const id=clean(body.exceptionId,120),decision=clean(body.decision,20),note=clean(body.note,1200);if(!id||!["approve","reject"].includes(decision))return json({error:"Exception ID ve approve/reject kararı zorunludur."},400);if(decision==="reject"&&note.length<10)return json({error:"Ret gerekçesi en az 10 karakter olmalıdır."},400);
   const result=await transitionAssuranceException(env.DB,id,decision as "approve"|"reject",access.actor.email,note);
   return json({ok:true,...result,message:result.status==="active"?"Assurance exception onaylandı; assurance state değiştirilmedi.":"Assurance exception reddedildi."});
  }
  if(action==="revoke-exception"){
   const id=clean(body.exceptionId,120),note=clean(body.note,1200);
   const result=await transitionAssuranceException(env.DB,id,"revoke",access.actor.email,note);
   return json({ok:true,...result,message:result.retestWorkItemId?"Assurance exception revoke edildi; zorunlu re-test inceleme kuyruğuna alındı.":"Assurance exception revoke edildi; bağlı otomasyon finding/rule olmadığı için manuel re-test takibi gerekiyor."});
  }
  return json({error:"Geçersiz governance işlemi."},400);
 }catch(error){if(error instanceof RiskReviewError)return json({error:error.message},error.status);return json({error:error instanceof Error?error.message:"Assurance governance işlemi tamamlanamadı."},400)}
}
