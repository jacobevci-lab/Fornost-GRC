import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../auth/security";
import { cleanAiText, redactSensitiveText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";
import { createConfiguredTicket } from "@/app/integrations/ticketing";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
function parseObject(value:unknown){try{const parsed=JSON.parse(String(value||"{}"));return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return {};}}
function parseRefs(value:unknown){try{const parsed=JSON.parse(String(value||"[]"));return Array.isArray(parsed)?parsed.filter((item)=>typeof item==="string").slice(0,20):[];}catch{return [];}}

export async function POST(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>16_384)return json({error:"Ticket isteği izin verilen boyutu aşıyor."},413);
  const body=await req.json().catch(()=>({})),id=cleanAiText(body.id,100),note=redactSensitiveText(body.note,800),confirmation=cleanAiText(body.confirmation,20);
  if(!id||note.length<5||confirmation!=="OLUŞTUR")return json({error:"En az 5 karakterlik açıklama ve OLUŞTUR onayı gereklidir."},400);
  const env=await aiRuntime(),draft=await env.DB.prepare("SELECT * FROM ai_action_drafts WHERE id=?").bind(id).first<Record<string,unknown>>();
  if(!draft)return json({error:"AI taslağı bulunamadı."},404);
  if(draft.kind!=="remediation-task"||draft.status!=="approved")return json({error:"Yalnız onaylanmış iyileştirme görevi taslakları ticket'a dönüştürülebilir."},409);
  const existing=await env.DB.prepare("SELECT * FROM ai_draft_tickets WHERE draft_id=?").bind(id).first<Record<string,unknown>>();
  if(existing)return json({error:existing.status==="created"?"Bu taslak için daha önce ticket oluşturuldu.":"Bu taslak için ticket işlemi daha önce başlatıldı; çift kayıt riskini önlemek için otomatik yeniden deneme kapalıdır.",ticket:existing},409);
  const operationId=crypto.randomUUID(),now=new Date().toISOString();
  const reserved=await env.DB.prepare(`INSERT INTO ai_draft_tickets(id,draft_id,status,publication_note,created_by,created_at) SELECT ?,?,'creating',?,?,? WHERE NOT EXISTS(SELECT 1 FROM ai_draft_tickets WHERE draft_id=?)`).bind(operationId,id,note,access.actor.email,now,id).run();
  if(Number(reserved.meta?.changes||0)!==1)return json({error:"Ticket işlemi başka bir kullanıcı tarafından başlatıldı."},409);
  const payload=parseObject(draft.payload_json),refs=parseRefs(draft.source_refs_json);
  const description=[cleanAiText(payload.description,1800),`Sorumlu: ${cleanAiText(payload.owner,200)}`,`Hedef tarih: ${cleanAiText(payload.dueDate,30)}`,`Öncelik: ${cleanAiText(payload.priority,50)}`,`Kabul kriteri: ${cleanAiText(payload.acceptanceCriteria,1000)}`,`İnsan onay notu: ${note}`,`Fornost AI taslak: ${id}`,refs.length?`Kaynaklar: ${refs.join(", ")}`:""].filter(Boolean).join("\n\n");
  try{
    const result=await createConfiguredTicket(env.DB,env,{title:cleanAiText(payload.title||draft.title,200),description,sourceId:id}),completedAt=new Date().toISOString();
    await env.DB.prepare("UPDATE ai_draft_tickets SET status='created',provider=?,external_id=?,external_url=?,completed_at=? WHERE id=? AND status='creating'").bind(result.provider,result.ticket.id,result.ticket.url,completedAt,operationId).run();
    await env.DB.prepare("INSERT INTO ai_draft_events(id,draft_id,action,actor,detail,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,"ticket-created",access.actor.email,cleanAiText(`${result.provider}:${result.ticket.id}`,500),completedAt).run();
    await recordAiEvent(env.DB,{actor:access.actor.email,action:"draft-ticket-create",provider:String(draft.provider||""),model:String(draft.model||""),status:"success",detail:`${id} published to ${result.provider} ticket ${result.ticket.id}`});
    return json({ticket:{status:"created",provider:result.provider,externalId:result.ticket.id,url:result.ticket.url,note,createdBy:access.actor.email,createdAt:now,completedAt}},201);
  }catch(error){
    const message=error instanceof Error?error.message:"Ticket oluşturulamadı.";
    await env.DB.prepare("UPDATE ai_draft_tickets SET status='failed',last_error=?,completed_at=? WHERE id=?").bind(cleanAiText(message,500),new Date().toISOString(),operationId).run();
    await recordAiEvent(env.DB,{actor:access.actor.email,action:"draft-ticket-create",provider:String(draft.provider||""),model:String(draft.model||""),status:"error",detail:`${id}: ${message}`});
    return json({error:`${message} Çift ticket riskini önlemek için bu taslak otomatik yeniden denenmez.`},502);
  }
}
