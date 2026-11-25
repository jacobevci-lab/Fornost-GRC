import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { AI_FEEDBACK_KINDS,AI_FEEDBACK_SEVERITIES,AI_FEEDBACK_STATUSES,type AiFeedbackStatus,validateAiFeedback,validateAiFeedbackDecision } from "@/app/ai/feedback";
import { aiRuntime,recordAiEvent } from "@/app/ai/storage";
import { cleanAiText } from "@/app/ai/security";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const number=(value:unknown)=>Number(value||0);
const mapped=(row:Record<string,unknown>)=>({id:row.id,activityId:row.activity_id,kind:row.kind,severity:row.severity,comment:row.comment,status:row.status,assignedTo:row.assigned_to,resolutionNote:row.resolution_note,createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at,resolvedBy:row.resolved_by,resolvedAt:row.resolved_at,provider:row.provider,model:row.model});

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const status=cleanAiText(req.nextUrl.searchParams.get("status"),20),kind=cleanAiText(req.nextUrl.searchParams.get("kind"),20),severity=cleanAiText(req.nextUrl.searchParams.get("severity"),20),limit=Math.min(100,Math.max(10,Math.trunc(Number(req.nextUrl.searchParams.get("limit"))||50)));
  if(status&&!AI_FEEDBACK_STATUSES.includes(status as never))return json({error:"Geçersiz durum filtresi."},400);
  if(kind&&!AI_FEEDBACK_KINDS.includes(kind as never))return json({error:"Geçersiz tür filtresi."},400);
  if(severity&&!AI_FEEDBACK_SEVERITIES.includes(severity as never))return json({error:"Geçersiz önem filtresi."},400);
  const where:string[]=[],bindings:unknown[]=[];
  if(status){where.push("f.status=?");bindings.push(status);}if(kind){where.push("f.kind=?");bindings.push(kind);}if(severity){where.push("f.severity=?");bindings.push(severity);}
  const {DB}=await aiRuntime(),clause=where.length?`WHERE ${where.join(" AND ")}`:"";
  const [rows,summary]=await Promise.all([
    DB.prepare(`SELECT f.*,a.provider,a.model FROM ai_feedback f LEFT JOIN ai_activity_logs a ON a.id=f.activity_id ${clause} ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,f.created_at DESC LIMIT ?`).bind(...bindings,limit).all<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status IN ('open','in_review') THEN 1 ELSE 0 END) unresolved,SUM(CASE WHEN status IN ('open','in_review') AND severity IN ('high','critical') THEN 1 ELSE 0 END) high_risk,SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) resolved,SUM(CASE WHEN kind='helpful' THEN 1 ELSE 0 END) helpful FROM ai_feedback`).first<Record<string,unknown>>(),
  ]);
  return json({items:(rows.results||[]).map(mapped),summary:{total:number(summary?.total),unresolved:number(summary?.unresolved),highRisk:number(summary?.high_risk),resolved:number(summary?.resolved),helpful:number(summary?.helpful)}});
}

export async function POST(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8_192)return json({error:"Geri bildirim isteği çok büyük."},413);
  let value;try{value=validateAiFeedback(await req.json().catch(()=>({})));}catch(error){return json({error:error instanceof Error?error.message:"Geri bildirim doğrulanamadı."},400);}
  const {DB}=await aiRuntime(),id=`AIFB-${crypto.randomUUID()}`,now=new Date().toISOString();
  const result=await DB.prepare(`INSERT OR IGNORE INTO ai_feedback(id,activity_id,kind,severity,comment,status,created_by,created_at,updated_by,updated_at) SELECT ?,?,?,?,?, 'open',?,?,?,? WHERE EXISTS(SELECT 1 FROM ai_activity_logs WHERE id=? AND actor=? AND action='chat' AND status='success') AND NOT EXISTS(SELECT 1 FROM ai_feedback WHERE activity_id=? AND created_by=?)`).bind(id,value.activityId,value.kind,value.severity,value.comment,access.actor.email,now,access.actor.email,now,value.activityId,access.actor.email,value.activityId,access.actor.email).run();
  if(Number(result.meta?.changes||0)!==1)return json({error:"Yanıt bulunamadı veya bu yanıt için daha önce geri bildirim gönderildi."},409);
  await recordAiEvent(DB,{actor:access.actor.email,action:"feedback-create",status:"success",detail:`AI feedback ${id} created; kind=${value.kind}; severity=${value.severity}`});
  return json({ok:true,id},201);
}

const transitions:Record<AiFeedbackStatus,AiFeedbackStatus[]>={open:["in_review","resolved","dismissed"],in_review:["open","resolved","dismissed"],resolved:["open"],dismissed:["open"]};
export async function PATCH(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8_192)return json({error:"Karar isteği çok büyük."},413);
  let value;try{value=validateAiFeedbackDecision(await req.json().catch(()=>({})),access.actor.email);}catch(error){return json({error:error instanceof Error?error.message:"Karar doğrulanamadı."},400);}
  const {DB}=await aiRuntime(),current=await DB.prepare("SELECT status FROM ai_feedback WHERE id=?").bind(value.id).first<{status:AiFeedbackStatus}>();
  if(!current)return json({error:"Geri bildirim kaydı bulunamadı."},404);if(!transitions[current.status]?.includes(value.status))return json({error:`${current.status} durumundan ${value.status} durumuna geçilemez.`},409);
  const now=new Date().toISOString(),closed=["resolved","dismissed"].includes(value.status),result=await DB.prepare("UPDATE ai_feedback SET status=?,assigned_to=?,resolution_note=?,updated_by=?,updated_at=?,resolved_by=?,resolved_at=? WHERE id=? AND status=?").bind(value.status,value.assignedTo,closed?value.resolutionNote:null,access.actor.email,now,closed?access.actor.email:null,closed?now:null,value.id,current.status).run();
  if(Number(result.meta?.changes||0)!==1)return json({error:"Kayıt başka bir işlem tarafından güncellendi; listeyi yenileyin."},409);
  await recordAiEvent(DB,{actor:access.actor.email,action:`feedback-${value.status}`,status:"success",detail:`AI feedback ${value.id} moved from ${current.status} to ${value.status}`});return json({ok:true});
}
