import {NextRequest,NextResponse} from "next/server";
import {requireRole,type AppRole} from "../../auth/security";
import {clean} from "../../integrations/security";
import {applyApprovedResidualRisk,exceptionEffectiveStatus,validateAssuranceException,validateRiskReviewProposal,type RiskReviewProposal} from "../../../assurance-governance";

type Env=Record<string,unknown>&{DB:D1Database};
type ReviewRow={id:string;risk_id:string;status:string;proposal_json:string;submitted_by:string;submitted_at:string;reviewed_by:string|null;reviewed_at:string|null;review_note:string|null};
type ExceptionRow={id:string;finding_id:string;rule_id:string;control_ref:string;risk_ref:string;reason:string;expires_at:string;evidence_reference:string;evidence_sha256:string;status:string;submitted_by:string;submitted_at:string;reviewed_by:string|null;reviewed_at:string|null;review_note:string|null;revoked_by:string|null;revoked_at:string|null};
const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_risk_reviews(id TEXT PRIMARY KEY,risk_id TEXT NOT NULL,status TEXT NOT NULL,proposal_json TEXT NOT NULL,submitted_by TEXT NOT NULL,submitted_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT)`,
 `CREATE INDEX IF NOT EXISTS ca_risk_reviews_status_idx ON continuous_assurance_risk_reviews(status,submitted_at)`,
 `CREATE INDEX IF NOT EXISTS ca_risk_reviews_risk_idx ON continuous_assurance_risk_reviews(risk_id,status)`,
 `CREATE TABLE IF NOT EXISTS continuous_assurance_exceptions(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL DEFAULT '',rule_id TEXT NOT NULL DEFAULT '',control_ref TEXT NOT NULL DEFAULT '',risk_ref TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL,expires_at TEXT NOT NULL,evidence_reference TEXT NOT NULL,evidence_sha256 TEXT NOT NULL,status TEXT NOT NULL,submitted_by TEXT NOT NULL,submitted_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,revoked_by TEXT,revoked_at TEXT)`,
 `CREATE INDEX IF NOT EXISTS ca_exceptions_status_expiry_idx ON continuous_assurance_exceptions(status,expires_at)`,
];
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
async function ready(db:D1Database){for(const sql of schema)await db.prepare(sql).run()}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
const today=()=>new Date().toISOString().slice(0,10);
async function riskRecord(db:D1Database,id:string){return db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(id).first<{id:string;data_json:string;updated_at:string}>()}
async function counts(db:D1Database){
 let pendingWork=0,failedRetest=0,openFindings=0;
 try{const row=await db.prepare("SELECT SUM(CASE WHEN status IN ('pending-review','approved-awaiting-retest') THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status IN ('failed-retest','retest-error') THEN 1 ELSE 0 END) failed FROM continuous_assurance_work_items").first<{pending:number;failed:number}>();pendingWork=Number(row?.pending||0);failedRetest=Number(row?.failed||0)}catch{}
 try{const row=await db.prepare("SELECT COUNT(*) n FROM evidence_automation_findings WHERE status!='closed'").first<{n:number}>();openFindings=Number(row?.n||0)}catch{}
 return{pendingWork,failedRetest,openFindings};
}

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const env=await runtime();await ready(env.DB);
 const [reviewsResult,exceptionsResult,risksResult,operational]=await Promise.all([
  env.DB.prepare("SELECT * FROM continuous_assurance_risk_reviews ORDER BY CASE status WHEN 'pending-review' THEN 0 ELSE 1 END,submitted_at DESC LIMIT 500").all<ReviewRow>(),
  env.DB.prepare("SELECT * FROM continuous_assurance_exceptions ORDER BY CASE status WHEN 'pending-review' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,expires_at,submitted_at DESC LIMIT 500").all<ExceptionRow>(),
  env.DB.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Risk Assessment' ORDER BY updated_at DESC LIMIT 2000").all<{id:string;data_json:string;updated_at:string}>(),
  counts(env.DB),
 ]);
 const nowDay=today(),in14=new Date(Date.now()+14*86_400_000).toISOString().slice(0,10);
 const risks=risksResult.results.map(row=>({id:row.id,data:parse(row.data_json),updatedAt:row.updated_at}));
 const reviews=reviewsResult.results.map(row=>({id:row.id,riskId:row.risk_id,status:row.status,proposal:parse(row.proposal_json),submittedBy:row.submitted_by,submittedAt:row.submitted_at,reviewedBy:row.reviewed_by||"",reviewedAt:row.reviewed_at||"",reviewNote:row.review_note||""}));
 const exceptions=exceptionsResult.results.map(row=>({id:row.id,findingId:row.finding_id,ruleId:row.rule_id,controlRef:row.control_ref,riskRef:row.risk_ref,reason:row.reason,expiresAt:row.expires_at,evidenceReference:row.evidence_reference,status:exceptionEffectiveStatus(row.status,row.expires_at,nowDay),storedStatus:row.status,submittedBy:row.submitted_by,submittedAt:row.submitted_at,reviewedBy:row.reviewed_by||"",reviewedAt:row.reviewed_at||"",reviewNote:row.review_note||""}));
 const reviewRequired=risks.filter(item=>item.data.residualRiskReviewRequired===true).length;
 const effective=risks.filter(item=>item.data.assuranceState==="effective").length,degraded=risks.filter(item=>item.data.assuranceState==="degraded").length,ineffective=risks.filter(item=>item.data.assuranceState==="ineffective").length;
 const activeExceptions=exceptions.filter(item=>item.status==="active").length,expiringExceptions=exceptions.filter(item=>item.status==="active"&&item.expiresAt<=in14).length;
 return json({riskReviews:reviews,exceptions,risksRequiringReview:risks.filter(item=>item.data.residualRiskReviewRequired===true).map(item=>({id:item.id,title:String(item.data.title||item.id),owner:String(item.data.owner||""),riskLevel:String(item.data.riskLevel||item.data.residualRiskLevel||""),assuranceState:String(item.data.assuranceState||"unknown"),lastAssuranceRunRef:String(item.data.lastAssuranceRunRef||""),reason:String(item.data.reassessmentReason||"")})),summary:{reviewRequired,pendingRiskReviews:reviews.filter(item=>item.status==="pending-review").length,activeExceptions,expiringExceptions,effective,degraded,ineffective,...operational}});
}

export async function POST(req:NextRequest){
 if(Number(req.headers.get("content-length")||0)>131_072)return json({error:"İstek boyutu çok büyük."},413);
 const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,50);
 const reviewActions=new Set(["review-risk","review-exception","revoke-exception"]),roles:AppRole[]=reviewActions.has(action)?["Admin"]:["Admin","Editor"];
 const access=await requireRole(req,roles);if(access.response)return access.response;
 const env=await runtime();await ready(env.DB);const stamp=new Date().toISOString();
 try{
  if(action==="submit-risk-review"){
   const proposal=validateRiskReviewProposal(body),risk=await riskRecord(env.DB,proposal.riskId);if(!risk)return json({error:"Risk kaydı bulunamadı."},404);
   const riskData=parse(risk.data_json);if(riskData.residualRiskReviewRequired!==true)return json({error:"Bu risk için Continuous Assurance yeniden değerlendirmesi beklenmiyor."},409);
   const existing=await env.DB.prepare("SELECT id FROM continuous_assurance_risk_reviews WHERE risk_id=? AND status='pending-review' LIMIT 1").bind(proposal.riskId).first<{id:string}>();if(existing)return json({ok:true,id:existing.id,message:"Risk yeniden değerlendirmesi zaten inceleme bekliyor."});
   const id=`CAR-${crypto.randomUUID()}`;await env.DB.prepare("INSERT INTO continuous_assurance_risk_reviews(id,risk_id,status,proposal_json,submitted_by,submitted_at) VALUES(?,?,'pending-review',?,?,?)").bind(id,proposal.riskId,JSON.stringify(proposal),access.actor.email,stamp).run();return json({ok:true,id,message:"Residual risk yeniden değerlendirmesi bağımsız incelemeye gönderildi."},201);
  }
  if(action==="review-risk"){
   const id=clean(body.reviewId,120),decision=clean(body.decision,20),note=clean(body.note,1200);if(!id||!["approve","reject"].includes(decision))return json({error:"Review ID ve approve/reject kararı zorunludur."},400);if(decision==="reject"&&note.length<10)return json({error:"Ret gerekçesi en az 10 karakter olmalıdır."},400);
   const review=await env.DB.prepare("SELECT * FROM continuous_assurance_risk_reviews WHERE id=?").bind(id).first<ReviewRow>();if(!review)return json({error:"Risk review bulunamadı."},404);if(review.status!=="pending-review")return json({error:"Bu review artık inceleme beklemiyor."},409);if(review.submitted_by.toLowerCase()===access.actor.email.toLowerCase())return json({error:"Maker-checker: review'u gönderen kişi onaylayamaz."},409);
   if(decision==="reject"){await env.DB.prepare("UPDATE continuous_assurance_risk_reviews SET status='rejected',reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?").bind(access.actor.email,stamp,note,id).run();return json({ok:true,status:"rejected",message:"Risk yeniden değerlendirmesi reddedildi."})}
   const risk=await riskRecord(env.DB,review.risk_id);if(!risk)return json({error:"Bağlı risk kaydı bulunamadı."},404);const proposal=parse(review.proposal_json) as unknown as RiskReviewProposal,updated=applyApprovedResidualRisk(parse(risk.data_json),proposal,access.actor.email,stamp);await env.DB.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(updated),stamp,review.risk_id).run();await env.DB.prepare("UPDATE continuous_assurance_risk_reviews SET status='approved',reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?").bind(access.actor.email,stamp,note||"Residual risk reassessment approved.",id).run();return json({ok:true,status:"approved",message:"Residual risk bağımsız inceleme ile onaylandı."});
  }
  if(action==="create-exception"){
   const proposal=validateAssuranceException(body,today()),id=`CAE-${crypto.randomUUID()}`;await env.DB.prepare("INSERT INTO continuous_assurance_exceptions(id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,evidence_reference,evidence_sha256,status,submitted_by,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,'pending-review',?,?)").bind(id,proposal.findingId,proposal.ruleId,proposal.controlRef,proposal.riskRef,proposal.reason,proposal.expiresAt,proposal.evidenceReference,proposal.evidenceSha256,access.actor.email,stamp).run();return json({ok:true,id,message:"Assurance exception bağımsız onaya gönderildi."},201);
  }
  if(action==="review-exception"){
   const id=clean(body.exceptionId,120),decision=clean(body.decision,20),note=clean(body.note,1200);if(!id||!["approve","reject"].includes(decision))return json({error:"Exception ID ve approve/reject kararı zorunludur."},400);if(decision==="reject"&&note.length<10)return json({error:"Ret gerekçesi en az 10 karakter olmalıdır."},400);
   const exception=await env.DB.prepare("SELECT * FROM continuous_assurance_exceptions WHERE id=?").bind(id).first<ExceptionRow>();if(!exception)return json({error:"Exception bulunamadı."},404);if(exception.status!=="pending-review")return json({error:"Exception artık inceleme beklemiyor."},409);if(exception.submitted_by.toLowerCase()===access.actor.email.toLowerCase())return json({error:"Maker-checker: exception talebini oluşturan kişi onaylayamaz."},409);if(decision==="approve"&&exception.expires_at<today())return json({error:"Süresi geçmiş exception onaylanamaz; yeni bir talep oluşturun."},409);
   const status=decision==="approve"?"active":"rejected";await env.DB.prepare("UPDATE continuous_assurance_exceptions SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?").bind(status,access.actor.email,stamp,note||"Assurance exception approved.",id).run();
   if(status==="active"&&exception.risk_ref){const risk=await riskRecord(env.DB,exception.risk_ref);if(risk){const data=parse(risk.data_json);data.assuranceExceptionStatus="active";data.assuranceExceptionRef=id;data.assuranceExceptionExpiresAt=exception.expires_at;data.assuranceExceptionReason=exception.reason;await env.DB.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(data),stamp,exception.risk_ref).run()}}
   return json({ok:true,status,message:status==="active"?"Assurance exception onaylandı; assurance state değiştirilmedi.":"Assurance exception reddedildi."});
  }
  if(action==="revoke-exception"){
   const id=clean(body.exceptionId,120),note=clean(body.note,1200);if(note.length<10)return json({error:"Revocation gerekçesi en az 10 karakter olmalıdır."},400);const exception=await env.DB.prepare("SELECT * FROM continuous_assurance_exceptions WHERE id=?").bind(id).first<ExceptionRow>();if(!exception||exception.status!=="active")return json({error:"Aktif exception bulunamadı."},404);if(exception.submitted_by.toLowerCase()===access.actor.email.toLowerCase())return json({error:"Maker-checker: talebi oluşturan kişi exception'ı revoke edemez."},409);await env.DB.prepare("UPDATE continuous_assurance_exceptions SET status='revoked',revoked_by=?,revoked_at=?,review_note=? WHERE id=?").bind(access.actor.email,stamp,note,id).run();return json({ok:true,status:"revoked",message:"Assurance exception revoke edildi."});
  }
  return json({error:"Geçersiz governance işlemi."},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Assurance governance işlemi tamamlanamadı."},400)}
}
