import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { clean } from "../integrations/security";
import { controlHealth, evidenceFreshness } from "../../evidence/continuous-controls";
import { evaluateAssuranceRecovery, type AssuranceState, type EvidenceFreshness, type RetestResult } from "../../assurance-recovery";
import { buildContinuousAssuranceCapaCandidate } from "../../continuous-assurance-capa";

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
type WorkRow = { id:string; finding_id:string; rule_id:string; action:string; status:string; decision_json:string; created_at:string; updated_at:string; actor:string };

const workSchema = [
  `CREATE TABLE IF NOT EXISTS continuous_assurance_work_items(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL,rule_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,decision_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,actor TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS continuous_assurance_work_items_status_idx ON continuous_assurance_work_items(status,action,updated_at)`,
  `CREATE INDEX IF NOT EXISTS continuous_assurance_work_items_finding_idx ON continuous_assurance_work_items(finding_id,action,status)`,
];

async function runtime(){const {env}=await import("cloudflare:workers");return env as unknown as Env}
async function ready(db:D1Database){for(const sql of workSchema)await db.prepare(sql).run()}
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

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
  const env=await runtime();await ready(env.DB);
  const result=await env.DB.prepare("SELECT * FROM continuous_assurance_work_items ORDER BY CASE status WHEN 'pending-review' THEN 0 ELSE 1 END,updated_at DESC LIMIT 500").all<WorkRow>();
  const items=result.results.map(row=>({id:row.id,findingId:row.finding_id,ruleId:row.rule_id,action:row.action,status:row.status,decision:parseData(row.decision_json),createdAt:row.created_at,updatedAt:row.updated_at,actor:row.actor}));
  return json({items,summary:{total:items.length,pendingReview:items.filter(item=>item.status==="pending-review").length,capaPromotion:items.filter(item=>item.action==="capa-promotion"&&item.status==="pending-review").length,retest:items.filter(item=>item.action==="control-retest"&&item.status==="pending-review").length}});
}

export async function POST(req:NextRequest){
  if(Number(req.headers.get("content-length")||0)>131_072)return json({error:"İstek boyutu çok büyük."},413);
  const access=await requireRole(req,["Admin","Editor"]);if(access.response)return access.response;
  const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,40),findingId=clean(body.findingId,120);
  if(!findingId)return json({error:"Bulgu referansı zorunludur."},400);
  const env=await runtime();await ready(env.DB);
  try{
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
      const existing=await env.DB.prepare("SELECT id FROM continuous_assurance_work_items WHERE finding_id=? AND action='control-retest' AND status='pending-review' LIMIT 1").bind(findingId).first<{id:string}>();
      if(existing)return json({ok:true,id:existing.id,message:"Yeniden test işi zaten beklemede.",recovery});
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
        owner:context.finding.owner,
        reviewer:clean(body.reviewer,200),
        dueDate:context.finding.due_date,
        controlRef:firstRef(context.rule.control_refs),
        riskRef:context.risk?.id||"",
        rootCause:clean(body.rootCause,2400),
        correctiveAction:clean(body.correctiveAction,2400),
        preventiveAction:clean(body.preventiveAction,2400),
        originEvidenceReference:context.finding.evidence_id||"",
        originEvidenceSha256:String(evidenceData.responseHash||""),
      },now.toISOString().slice(0,10));
      if(!candidate.eligible)return json({error:"CAPA promotion governance koşulları tamamlanmadı.",candidate},409);
      const existing=await env.DB.prepare("SELECT id FROM continuous_assurance_work_items WHERE finding_id=? AND action='capa-promotion' AND status='pending-review' LIMIT 1").bind(findingId).first<{id:string}>();
      if(existing)return json({ok:true,id:existing.id,message:"CAPA promotion işi zaten beklemede.",candidate});
      const id=`CAW-${crypto.randomUUID()}`,stamp=now.toISOString(),decision={candidate,recovery};
      await env.DB.prepare("INSERT INTO continuous_assurance_work_items(id,finding_id,rule_id,action,status,decision_json,created_at,updated_at,actor) VALUES(?,?,?,'capa-promotion','pending-review',?,?,?,?)").bind(id,findingId,context.rule.id,JSON.stringify(decision),stamp,stamp,access.actor.email).run();
      return json({ok:true,id,message:"Governed CAPA promotion işi inceleme kuyruğuna alındı.",candidate},201);
    }

    return json({error:"Geçersiz sürekli güvence işlemi."},400);
  }catch(error){return json({error:error instanceof Error?error.message:"Sürekli güvence işlemi tamamlanamadı."},400)}
}
