import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";

type Env = Record<string, unknown> & { DB: D1Database };
type TimelineEvent = {
  id: string;
  type: string;
  category: "control" | "review" | "capa" | "finding" | "risk";
  title: string;
  detail: string;
  actor: string;
  status: string;
  reference: string;
  findingId?: string;
  ruleId?: string;
  createdAt: string;
};

async function runtime(){const {env}=await import("cloudflare:workers");return env as unknown as Env}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(raw:string|undefined|null)=>{try{return JSON.parse(raw||"{}") as Record<string,unknown>}catch{return {}}};

async function safeRows<T>(db:D1Database,sql:string){try{return (await db.prepare(sql).all<T>()).results}catch{return [] as T[]}}

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
  const env=await runtime(),events:TimelineEvent[]=[];

  const work=await safeRows<Record<string,unknown>>(env.DB,"SELECT id,finding_id,rule_id,action,status,actor,reviewed_by,reviewed_at,review_note,result_ref,completed_at,created_at,updated_at FROM continuous_assurance_work_items ORDER BY updated_at DESC LIMIT 300");
  for(const row of work){
    events.push({
      id:`work:${row.id}`,
      type:String(row.action||"assurance-work"),
      category:String(row.action)==="capa-promotion"?"capa":"review",
      title:String(row.action)==="capa-promotion"?"CAPA promotion work":"Control re-test work",
      detail:String(row.review_note||`${row.action||"assurance"} · ${row.status||"unknown"}`),
      actor:String(row.reviewed_by||row.actor||"system"),
      status:String(row.status||""),
      reference:String(row.result_ref||row.id||""),
      findingId:String(row.finding_id||""),ruleId:String(row.rule_id||""),
      createdAt:String(row.reviewed_at||row.completed_at||row.updated_at||row.created_at||"")
    });
  }

  const runs=await safeRows<Record<string,unknown>>(env.DB,"SELECT id,rule_id,rule_name,status,detail,evidence_id,created_at,actor,trigger_type FROM evidence_automation_runs ORDER BY created_at DESC LIMIT 300");
  for(const row of runs)events.push({id:`run:${row.id}`,type:"control-run",category:"control",title:String(row.rule_name||"Continuous control run"),detail:String(row.detail||""),actor:String(row.actor||"system"),status:String(row.status||""),reference:String(row.evidence_id||row.id||""),ruleId:String(row.rule_id||""),createdAt:String(row.created_at||"")});

  const findingEvents=await safeRows<Record<string,unknown>>(env.DB,"SELECT id,finding_id,action,from_status,to_status,detail,actor,created_at FROM enterprise_finding_events ORDER BY created_at DESC LIMIT 300");
  for(const row of findingEvents)events.push({id:`finding:${row.id}`,type:String(row.action||"finding-event"),category:"finding",title:`Finding ${String(row.action||"event")}`,detail:String(row.detail||`${row.from_status||""} → ${row.to_status||""}`),actor:String(row.actor||"system"),status:String(row.to_status||row.from_status||""),reference:String(row.finding_id||""),findingId:String(row.finding_id||""),createdAt:String(row.created_at||"")});

  const risks=await safeRows<Record<string,unknown>>(env.DB,"SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Risk Assessment' ORDER BY updated_at DESC LIMIT 300");
  for(const row of risks){
    const data=parse(String(row.data_json||"{}"));
    if(String(data.reassessmentSource||"")!=="Continuous Assurance")continue;
    events.push({id:`risk:${row.id}:${row.updated_at}`,type:"risk-reassessment",category:"risk",title:String(data.title||"Risk reassessment"),detail:String(data.reassessmentReason||"Continuous Assurance risk reassessment"),actor:"system:continuous-assurance",status:String(data.assuranceState||""),reference:String(row.id||""),findingId:String(row.id||""),createdAt:String(data.lastReassessedAt||row.updated_at||"")});
  }

  const normalized=events.filter(event=>event.createdAt&&Number.isFinite(new Date(event.createdAt).getTime())).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,500);
  return json({events:normalized,summary:{total:normalized.length,controls:normalized.filter(x=>x.category==="control").length,reviews:normalized.filter(x=>x.category==="review").length,capa:normalized.filter(x=>x.category==="capa").length,findings:normalized.filter(x=>x.category==="finding").length,risks:normalized.filter(x=>x.category==="risk").length}});
}
