import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {clean} from "../../integrations/security";
import {readAssuranceEscalationRows,reconcileAssuranceEscalations} from "../../../assurance-escalation-runtime";
import type {AssuranceEscalationDbRow} from "../../../assurance-escalation-store";

type Env=Record<string,unknown>&{DB:D1Database};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
const publicRow=(row:AssuranceEscalationDbRow)=>({id:row.id,fingerprint:row.fingerprint,kind:row.kind,severity:row.severity,subjectRef:row.subject_ref,owner:row.owner,title:row.title,detail:row.detail,status:row.status,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,acknowledgedBy:row.acknowledged_by||"",acknowledgedAt:row.acknowledged_at||"",ackNote:row.ack_note||"",resolvedBy:row.resolved_by||"",resolvedAt:row.resolved_at||"",source:parse(row.source_json)});
const statusRank=(status:string)=>status==="active"?0:status==="acknowledged"?1:2;
const severityRank=(severity:string)=>severity==="critical"?0:severity==="high"?1:2;

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const env=await runtime(),policy=await reconcileAssuranceEscalations(env.DB),cutoff=new Date(Date.now()-30*86_400_000).toISOString();
 const rows=(await readAssuranceEscalationRows(env.DB,500)).sort((a,b)=>statusRank(a.status)-statusRank(b.status)||severityRank(a.severity)-severityRank(b.severity)||b.last_seen_at.localeCompare(a.last_seen_at)),records=rows.map(publicRow),open=records.filter(item=>item.status!=="resolved");
 return json({records,policy,summary:{active:open.filter(item=>item.status==="active").length,acknowledged:open.filter(item=>item.status==="acknowledged").length,critical:open.filter(item=>item.severity==="critical").length,high:open.filter(item=>item.severity==="high").length,medium:open.filter(item=>item.severity==="medium").length,resolved30d:records.filter(item=>item.status==="resolved"&&item.resolvedAt>=cutoff).length}});
}

export async function POST(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor"]);if(access.response)return access.response;
 if(Number(req.headers.get("content-length")||0)>32_768)return json({error:"İstek boyutu çok büyük."},413);
 const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,40),id=clean(body.id,120),note=clean(body.note,1200);if(action!=="acknowledge"||!id)return json({error:"Geçersiz escalation işlemi."},400);if(note.length<10)return json({error:"Acknowledgement notu en az 10 karakter olmalıdır."},400);
 const env=await runtime();await reconcileAssuranceEscalations(env.DB);const row=await env.DB.prepare("SELECT * FROM continuous_assurance_escalations WHERE id=?").bind(id).first<AssuranceEscalationDbRow>();if(!row)return json({error:"Escalation bulunamadı."},404);if(row.status!=="active")return json({error:"Yalnız aktif escalation acknowledge edilebilir."},409);const stamp=new Date().toISOString();await env.DB.prepare("UPDATE continuous_assurance_escalations SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,ack_note=?,last_seen_at=? WHERE id=? AND status='active'").bind(access.actor.email,stamp,note,stamp,id).run();return json({ok:true,status:"acknowledged",acknowledgedBy:access.actor.email,acknowledgedAt:stamp});
}
