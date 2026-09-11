import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {aiRuntime,recordAiEvent} from "@/app/ai/storage";
import {getAiOperatingPolicy} from "@/app/ai/operating-policy";
import {cleanAiText} from "@/app/ai/security";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});

export async function GET(req:NextRequest){const access=await requireRole(req,["Admin"]);if(access.response)return access.response;const {DB}=await aiRuntime();return json({policy:await getAiOperatingPolicy(DB)});}

export async function PUT(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8192)return json({error:"AI operasyon politikası isteği çok büyük."},413);
  const body=await req.json().catch(()=>({}));
  if(body.confirmation!=="POLİTİKAYI UYGULA")return json({error:"POLİTİKAYI UYGULA onayı gereklidir."},400);
  const keys=["emergencyStop","chatEnabled","draftsEnabled","agentsEnabled","retrievalEnabled","evaluationsEnabled","viewerChat","editorChat"] as const;
  if(keys.some(key=>typeof body[key]!=="boolean"))return json({error:"Politika alanları eksik veya geçersiz."},400);
  const message=cleanAiText(body.maintenanceMessage,300),now=new Date().toISOString(),{DB}=await aiRuntime();
  await DB.prepare(`INSERT INTO ai_operating_policy(id,emergency_stop,chat_enabled,drafts_enabled,agents_enabled,retrieval_enabled,evaluations_enabled,viewer_chat,editor_chat,maintenance_message,updated_by,updated_at)
    VALUES('default',?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET emergency_stop=excluded.emergency_stop,chat_enabled=excluded.chat_enabled,drafts_enabled=excluded.drafts_enabled,agents_enabled=excluded.agents_enabled,retrieval_enabled=excluded.retrieval_enabled,evaluations_enabled=excluded.evaluations_enabled,viewer_chat=excluded.viewer_chat,editor_chat=excluded.editor_chat,maintenance_message=excluded.maintenance_message,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(body.emergencyStop?1:0,body.chatEnabled?1:0,body.draftsEnabled?1:0,body.agentsEnabled?1:0,body.retrievalEnabled?1:0,body.evaluationsEnabled?1:0,body.viewerChat?1:0,body.editorChat?1:0,message,access.actor.email,now).run();
  await recordAiEvent(DB,{actor:access.actor.email,action:"operating-policy-save",status:"success",detail:`emergency=${body.emergencyStop}; chat=${body.chatEnabled}; drafts=${body.draftsEnabled}; agents=${body.agentsEnabled}; retrieval=${body.retrievalEnabled}; evaluations=${body.evaluationsEnabled}; viewerChat=${body.viewerChat}; editorChat=${body.editorChat}`});
  return json({ok:true,policy:await getAiOperatingPolicy(DB)});
}
