import { cleanAiText } from "./security";
import { DEFAULT_AI_DATA_PROTECTION_POLICY, type AiDataProtectionPolicy, type AiProtectionResult } from "./data-protection";

type PolicyRow={enabled:number;mode:string;redact_tckn:number;redact_iban:number;redact_payment_card:number;redact_email:number;redact_phone:number;injection_detection:number;injection_action:string;updated_by:string;updated_at:string};

export async function getAiDataProtectionPolicy(db:D1Database):Promise<AiDataProtectionPolicy>{
  const row=await db.prepare("SELECT * FROM ai_data_protection_policy WHERE id='default'").first<PolicyRow>();
  if(!row)return DEFAULT_AI_DATA_PROTECTION_POLICY;
  return{enabled:!!row.enabled,mode:row.mode==="block"?"block":"redact",tckn:!!row.redact_tckn,iban:!!row.redact_iban,paymentCard:!!row.redact_payment_card,email:!!row.redact_email,phone:!!row.redact_phone,injectionDetection:!!row.injection_detection,injectionAction:row.injection_action==="block"?"block":"neutralize"};
}

export function validateAiDataProtectionPolicy(body:Record<string,unknown>):AiDataProtectionPolicy{
  const mode=cleanAiText(body.mode,20),injectionAction=cleanAiText(body.injectionAction,20);
  if(!["redact","block"].includes(mode))throw new Error("Geçerli bir DLP aksiyonu seçin.");
  if(!["neutralize","block"].includes(injectionAction))throw new Error("Geçerli bir prompt-injection aksiyonu seçin.");
  return{enabled:body.enabled!==false,mode:mode as "redact"|"block",tckn:body.tckn!==false,iban:body.iban!==false,paymentCard:body.paymentCard!==false,email:body.email!==false,phone:body.phone!==false,injectionDetection:body.injectionDetection!==false,injectionAction:injectionAction as "neutralize"|"block"};
}

export async function recordAiProtectionEvent(db:D1Database,input:{actor:string;operation:string;direction:"input"|"context"|"output"|"knowledge";result:AiProtectionResult}){
  if(!input.result.findingCount)return;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${input.operation}:${input.result.findings.sort().join(",")}:${input.result.findingCount}`));
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  await db.prepare(`INSERT INTO ai_data_protection_events(id,actor,operation,direction,action,categories_json,finding_count,event_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),cleanAiText(input.actor,320)||"unknown",cleanAiText(input.operation,80),input.direction,input.result.blocked?"blocked":"redacted",JSON.stringify(input.result.findings),input.result.findingCount,hash,new Date().toISOString()).run();
}
