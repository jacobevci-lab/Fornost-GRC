import { NextRequest, NextResponse } from "next/server";
import { requireRole, type AppRole } from "../auth/security";
import { clean } from "../integrations/security";
import { controlHealth, evidenceFreshness } from "../../evidence/continuous-controls";
import { evaluateAssuranceRecovery, type AssuranceState, type EvidenceFreshness, type RetestResult } from "../../assurance-recovery";
import { buildContinuousAssuranceCapaCandidate, type CapaPromotionCandidate } from "../../continuous-assurance-capa";
import { ensureAssuranceWorkSchema, reconcileApprovedRetests, type AssuranceWorkRow } from "../../continuous-assurance-runtime";
import { promoteContinuousAssuranceFinding } from "../../findings/promotion";

type Env = Record<string, unknown> & { DB: D1Database };
type RuleRow = {
  id: string;
  name: string;
  control_refs: string;
  enabled: number;
  last_status: string | null;
  last_evidence_at: string | null;
  freshness_hours: number;
  consecutive_failures: number;
};
type FindingRow = {
  id: string;
  rule_id: string;
  evidence_id: string | null;
  title: string;
  severity: string;
  owner: string;
  due_date: string;
  status: string;
  detail: string;
  closure_evidence_ref: string | null;
  closure_evidence_sha256: string | null;
  closed_at: string | null;
};
type RunRow = { status: string; evidence_id: string | null; created_at: string };
type WorkRow = AssuranceWorkRow & {
  finding_title?: string | null;
  finding_severity?: string | null;
  finding_owner?: string | null;
  finding_due_date?: string | null;
  rule_name?: string | null;
  control_refs?: string | null;
};

async function runtime(){const {env}=await import("cloudflare:workers");return env as unknown as Env}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const firstRef=(value:string)=>String(value||"").split(/[;,|\n]+/).map(item=>item.trim()).find(Boolean)||"";
const parseData=(raw:string|undefined|null)=>{try{return JSON.parse(raw||"{}") as Record<string,unknown>}catch{return {}}};

function assuranceStateFor(rule:RuleRow,now=new Date()):AssuranceState{
  const health=controlHealth({enabled:!!rule.enabled,lastStatus:rule.last_status,lastEvidenceAt:rule.last_evidence_at,freshnessHours:rule.freshness_hours,consecutiveFailures:rule.consecutive_failures},now);
  if(health==="healthy")return "effective";
  if(health==="failing")return "ineffective";
  if(health==="stale"||health==="expiring")return "degraded";
  return "unknown";
}
function retestResultFor(run:RunRow|null):RetestResult{
  if(!run)return "not-run";
  if(run.status==="pass")return "pass";
  if(run.status==="fail")return "fail";
  return "error";
}
function freshnessFor(rule:RuleRow,now=new Date()):EvidenceFreshness{
  const value=String(evidenceFreshness(rule.last_evidence_at,rule.freshness_hours,now));
  return value==="fresh"||value==="expiring"||value==="stale"||value==="missing"?value:"unknown";
}
async function loadContext(db:D1Database,findingId:string){
  const finding=await db.prepare("SELECT * FROM evidence_automation_findings WHERE id=?").bind(findingId).first<FindingRow>();
  if(!finding)throw new Error("Sürekli güvence bulgusu bulunamadı.");
  const rule=await db.prepare("SELECT id,name,control_refs,enabled,last_status,last_evidence_at,freshness_hours,consecutive_failures FROM evidence_automation_rules WHERE id=?").bind(finding.rule_id).first<RuleRow>();
  if(!rule)throw new Error("Sürekli kontrol kuralı bulunamadı.");
  const risk=await db.prepare("SELECT id,data_json FROM simple_grc_records WHERE id=? AND module='Risk Assessment'").bind(finding.id).first<{id:string;data_json:string}>();
  const evidence=finding.evidence_id?await db.prepare("SELECT data_json FROM simple_grc_records WHERE id=? AND module='Kanıtlar'").bind(finding.evidence_id).first<{data_json:string}>():null;
  const retest=finding.closed_at?await db.prepare("SELECT status,evidence_id,created_at FROM evidence_automation_runs WHERE rule_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1").bind(rule.id,finding.closed_at).first<RunRow>():null;
  return {finding,rule,risk,evidence,retest};
}
async function listWork(db:D1Database){
  try{
    return await db.prepare("SELECT w.*,f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id ORDER BY CASE w.status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END,w.updated_at DESC LIMIT 500").all<WorkRow>();
  }catch{
    return db.prepare("SELECT * FROM continuous_assurance_work_items ORDER BY updated_at DESC LIMIT 500").all<WorkRow>();
  }
}

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
  const env=await runtime();await ensureAssuranceWorkSchema(env.DB);await reconcileApprovedRetests(env.DB);
  const result=await listWork(env.DB);
  const items=result.results.map(row=>({
    id:row.id,findingId:row.finding_id,ruleId:row.rule_id,action:row.action,status:row.status,decision:parseData(row.decision_json),createdAt:row.created_at,updatedAt:row.updated_at,actor:row.actor,
    reviewedBy:row.reviewed_by||"",reviewedAt:row.reviewed_at||"",reviewNote:row.review_note||"",resultRef:row.result_ref||"",completedAt:row.completed_at||"",
    findingTitle:row.finding_title||row.finding_id,severity:row.finding_severity||"",owner:row.finding_owner||"",dueDate:row.finding_due_date||"",ruleName:row.rule_name||row.rule_id,controlRefs:row.control_refs||""
  }));
  return json({items,summary:{
    total:items.length,
    pendingReview:items.filter(item=>item.status==="pending-review").length,
    awaitingRetest:items.filter(item=>item.status==="approved-awaiting-retest").length,
    capaPromotion:items.filter(item=>item.action==="capa-promotion"&&item.status==="pending-review").length,
    retest:items.filter(item=>item.action==="control-retest"&&item.status==="pending-review").length,
    failedRetest:items.filter(item=>item.status==="failed-retest").length,
    retestError:items.filter(item=>item.status==="retest-error").length,
    completed:items.filter(item=>item.status==="completed").length,
    rejected:items.filter(item=>item.status==="rejected").length,
  }});
}

export async function POST(req:NextRequest){
  if(Number(req.headers.get("content-length")||0)>131_072)return json({error:"İstek boyutu çok büyük."},413);
  const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,40);
  const roles:AppRole[]=action==="review-work-item"?["Admin"]:["Admin","Editor"];
  const access=await requireRole(req,roles);if(access.response)return access.response;
  const env=await runtime();await ensureAssuranceWorkSchema(env.DB);
  try{
    if(action==="review-work-item"){
      const workItemId=clean(body.workItemId,120),decision=clean(body.decision,20),note=clean(body.note,1200);
      if(!workItemId||!["approve","reject"].includes(decision))return json({error:"İş kaydı ve approve/reject kararı zorunludur."},400);
      if(decision==="reject"&&note.length<10)return json({error:"Ret kararı için en az 10 karakter açıklama zorunludur."},400);
      const work=await env.DB.prepare("SELECT * FROM continuous_assurance_work_items WHERE id=?").bind(workItemId).first<AssuranceWorkRow>();
      if(!work)return json({error:"Güvence iş kaydı bulunamadı."},404);
      if(work.status!=="pending-review")return json({error:"Bu iş artık inceleme beklemiyor.",status:work.status},409);
      if(String(work.actor).toLowerCase()===access.actor.email.toLowerCase())return json({error:"Maker-checker: işi kuyruğa alan kullanıcı aynı işi onaylayamaz."},409);
      const stamp=new Date().toISOString();
      if(decision==="reject"){
        await env.DB.prepare("UPDATE continuous_assurance_work_items SET status='rejected',reviewed_by=?,reviewed_at=?,review_note=?,completed_at=?,updated_at=? WHERE id=? AND status='pending-review'").bind(access.actor.email,stamp,note,stamp,stamp,work.id).run();
        return json({ok:true,status:"rejected",message:"Güvence işi gerekçesiyle reddedildi."});
      }
      if(work.action==="control-retest"){
        await env.DB.prepare("UPDATE continuous_assurance_work_items SET status='approved-awaiting-retest',reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=? AND status='pending-review'").bind(access.actor.email,stamp,note||"Re-test approved.",stamp,work.id).run();
        return json({ok:true,status:"approved-awaiting-retest",message:"Re-test onaylandı. Bir sonraki kontrol çalışması bu iş kaydıyla otomatik uzlaştırılacak."});
      }
      if(work.action==="capa-promotion"){
        const stored=parseData(work.decision_json),candidate=stored.candidate as CapaPromotionCandidate|undefined;
        if(!candidate?.eligible||!candidate.payload)return json({error:"Kuyruktaki CAPA adayı artık doğrulanabilir durumda değil."},409);
        const promoted=await promoteContinuousAssuranceFinding(env.DB,candidate,access.actor.email,work.actor,work.id,new Date(stamp));
        await env.DB.prepare("UPDATE continuous_assurance_work_items SET status='completed',reviewed_by=?,reviewed_at=?,review_note=?,result_ref=?,completed_at=?,updated_at=? WHERE id=? AND status='pending-review'").bind(access.actor.email,stamp,note||"CAPA promotion approved.",promoted.id,stamp,stamp,work.id).run();
        return json({ok:true,status:"completed",resultRef:promoted.id,code:promoted.code,created:promoted.created,message:promoted.created?"CAPA promotion onaylandı ve canonical Findings & CAPA kaydı oluşturuldu.":"CAPA promotion onaylandı; mevcut canonical bulgu ile eşleştirildi."});
      }
      return json({error:"Bu iş türü için onay akışı tanımlı değil."},400);
    }

    const findingId=clean(body.findingId,120);
    if(!findingId)return json({error:"Bulgu referansı zorunludur."},400);
    const context=await loadContext(env.DB,findingId),now=new Date();
    const recovery=evaluateAssuranceRecovery({
      assuranceState:assuranceStateFor(context.rule,now),
      remediationStatus:context.finding.status,
      closureEvidenceRef:context.finding.closure_evidence_ref||"",
      closureEvidenceSha256:context.finding.closure_evidence_sha256||"",
      retestResult:retestResultFor(context.retest),
      retestEvidenceFreshness:freshnessFor(context.rule,now),
      riskLinked:Boolean(context.risk),
    });

    if(action==="evaluate-recovery")return json({findingId,ruleId:context.rule.id,recovery,retest:context.retest||null,riskLinked:Boolean(context.risk)});

    if(action==="queue-retest"){
      if(!recovery.readyForRetest||recovery.recoveryState!=="ready-for-retest")return json({error:"Kontrol henüz yeniden teste hazır değil.",recovery},409);
      const existing=await env.DB.prepare("SELECT id,status FROM continuous_assurance_work_items WHERE finding_id=? AND action='control-retest' AND status IN ('pending-review','approved-awaiting-retest') ORDER BY created_at DESC LIMIT 1").bind(findingId).first<{id:string;status:string}>();
      if(existing)return json({ok:true,id:existing.id,status:existing.status,message:"Yeniden test işi zaten aktif.",recovery});
      const id=`CAW-${crypto.randomUUID()}`,stamp=now.toISOString(),decision={recovery,ruleId:context.rule.id,controlRef:firstRef(context.rule.control_refs)};
      await env.DB.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor) VALUES(?,?,?,'control-retest','pending-review',?,?,?,?)").bind(id,findingId,context.rule.id,JSON.stringify(decision),stamp,stamp,access.actor.email).run();
      return json({ok:true,id,message:"Kontrol yeniden test işi güvence kuyruğuna alındı.",recovery},201);
    }

    if(action==="queue-capa-promotion"){
      const evidenceData=parseData(context.evidence?.data_json),candidate=buildContinuousAssuranceCapaCandidate({
        findingId:context.finding.id,
        ruleId:context.rule.id,
        ruleName:context.rule.name,
        title:context.finding.title,
        detail:context.finding.detail,
        severity:context.finding.severity,
        owner:clean(body.owner,200)||context.finding.owner,
        reviewer:clean(body.reviewer,200),
        dueDate:clean(body.dueDate,10)||context.finding.due_date,
        controlRef:firstRef(context.rule.control_refs),
        riskRef:context.risk?.id||"",
        rootCause:clean(body.rootCause,2400),
        correctiveAction:clean(body.correctiveAction,2400),
        preventiveAction:clean(body.preventiveAction,2400),
        originEvidenceReference:context.finding.evidence_id||"",
        originEvidenceSha256:String(evidenceData.responseHash||""),
      },now.toISOString().slice(0,10));
      if(!candidate.eligible)return json({error:"CAPA promotion governance koşulları tamamlanmadı.",candidate},409);
      const existing=await env.DB.prepare("SELECT id,status,result_ref FROM continuous_assurance_work_items WHERE finding_id=? AND action='capa-promotion' AND status IN ('pending-review','completed') ORDER BY created_at DESC LIMIT 1").bind(findingId).first<{id:string;status:string;result_ref:string|null}>();
      if(existing)return json({ok:true,id:existing.id,status:existing.status,resultRef:existing.result_ref||"",message:existing.status==="completed"?"CAPA promotion daha önce tamamlandı.":"CAPA promotion işi zaten beklemede.",candidate});
      const id=`CAW-${crypto.randomUUID()}`,stamp=now.toISOString(),decision={candidate,recovery};
      await env.DB.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor) VALUES(?,?,?,'capa-promotion','pending-review',?,?,?,?)").bind(id,findingId,context.rule.id,JSON.stringify(decision),stamp,stamp,access.actor.email).run();
      return json({ok:true,id,message:"Governed CAPA promotion işi inceleme kuyruğuna alındı.",candidate},201);
    }

    return json({error:"Geçersiz sürekli güvence işlemi."},400);
  }catch(error){return json({error:error instanceof Error?error.message:"Sürekli güvence işlemi tamamlanamadı."},400)}
}
