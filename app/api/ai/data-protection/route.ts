import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { getAiDataProtectionPolicy,validateAiDataProtectionPolicy } from "@/app/ai/data-protection-policy";
import { cleanAiText } from "@/app/ai/security";
import { aiRuntime,recordAiEvent } from "@/app/ai/storage";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parseCategories=(value:unknown)=>{try{const result=JSON.parse(String(value||"[]"));return Array.isArray(result)?result.filter(item=>typeof item==="string").slice(0,20):[];}catch{return[];}};

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const env=await aiRuntime(),since=new Date(Date.now()-30*86400_000).toISOString();
  const [policy,summary,recent]=await Promise.all([
    getAiDataProtectionPolicy(env.DB),
    env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(finding_count),0) findings,COALESCE(SUM(CASE WHEN action='blocked' THEN 1 ELSE 0 END),0) blocked FROM ai_data_protection_events WHERE created_at>=?").bind(since).first<Record<string,unknown>>(),
    env.DB.prepare("SELECT id,actor,operation,direction,action,categories_json,finding_count,created_at FROM ai_data_protection_events ORDER BY created_at DESC LIMIT 50").all<Record<string,unknown>>(),
  ]);
  return json({policy,summary:{events:Number(summary?.total||0),findings:Number(summary?.findings||0),blocked:Number(summary?.blocked||0)},recent:(recent.results||[]).map(row=>({id:row.id,actor:row.actor,operation:row.operation,direction:row.direction,action:row.action,categories:parseCategories(row.categories_json),findingCount:Number(row.finding_count||0),createdAt:row.created_at}))});
}

export async function PUT(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8_192)return json({error:"Veri koruma ayarı çok büyük."},413);
  const body=await req.json().catch(()=>({}));
  if(cleanAiText(body.confirmation,80)!=="VERİ KORUMAYI UYGULA")return json({error:"Değişiklik için VERİ KORUMAYI UYGULA yazın."},400);
  let policy;try{policy=validateAiDataProtectionPolicy(body);}catch(error){return json({error:error instanceof Error?error.message:"Politika doğrulanamadı."},400);}
  const env=await aiRuntime(),now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ai_data_protection_policy(id,enabled,mode,redact_tckn,redact_iban,redact_payment_card,redact_email,redact_phone,injection_detection,injection_action,updated_by,updated_at) VALUES('default',?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,mode=excluded.mode,redact_tckn=excluded.redact_tckn,redact_iban=excluded.redact_iban,redact_payment_card=excluded.redact_payment_card,redact_email=excluded.redact_email,redact_phone=excluded.redact_phone,injection_detection=excluded.injection_detection,injection_action=excluded.injection_action,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(policy.enabled?1:0,policy.mode,policy.tckn?1:0,policy.iban?1:0,policy.paymentCard?1:0,policy.email?1:0,policy.phone?1:0,policy.injectionDetection?1:0,policy.injectionAction,access.actor.email,now).run();
  await recordAiEvent(env.DB,{actor:access.actor.email,action:"data-protection-policy-update",status:"success",detail:`Gateway ${policy.enabled?"enabled":"disabled"}; DLP ${policy.mode}; injection ${policy.injectionAction}`});
  return json({policy});
}
