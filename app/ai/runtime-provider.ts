import { decryptSecret } from "@/app/api/integrations/security";
import { boundedNumber, envFlag, safeAiEndpoint } from "./security";
import { callAiProvider, type AiMessage, type AiProviderConfig } from "./provider";
import type { AiProviderKind, AiSettingsRow } from "./storage";
import { resolveProviderDataPolicy, strictestDataClassification } from "./data-policy";
import { AiBudgetExceededError,enforceAiBudget,isAiBudgetExceeded,recordAiUsage } from "./budget";

type Runtime=Record<string,unknown>&{DB:D1Database};
type FallbackRow={provider:AiProviderKind;base_url:string;model:string;enabled:number;config_json:string;secret_ciphertext:string|null};
export type AiRuntimeProfile=AiProviderConfig&{profile:"primary"|"fallback";trustZone:"external"|"private"|"local";maxDataClassification:"Public"|"Internal"|"Confidential"};

function parseConfig(value:string){try{const parsed=JSON.parse(value||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return {};}}
async function profile(env:Runtime,row:Pick<AiSettingsRow,"provider"|"base_url"|"model"|"config_json"|"secret_ciphertext">,name:"primary"|"fallback"){
  const baseUrl=safeAiEndpoint(row.base_url,envFlag(env,"FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS"),envFlag(env,"FORNOST_AI_ALLOW_LOOPBACK"));
  if(!baseUrl)throw new Error(`${name==="primary"?"Birincil":"Yedek"} AI endpoint güvenlik politikasına uygun değil.`);
  let apiKey="";
  if(row.secret_ciphertext){const key=String(env.FORNOST_SETTINGS_ENCRYPTION_KEY??"").trim();if(key.length<32)throw new Error("AI kimlik bilgileri çözülemiyor.");apiKey=await decryptSecret(row.secret_ciphertext,key);}
  const config=parseConfig(row.config_json);
  const dataPolicy=resolveProviderDataPolicy(baseUrl,config);
  return {profile:name,provider:row.provider,baseUrl,model:row.model,apiKey,temperature:boundedNumber(config.temperature,0.2,0,2),timeoutMs:boundedNumber(config.timeoutMs,60000,5000,120000),maxTokens:Math.round(boundedNumber(config.maxTokens,1200,128,4096)),...dataPolicy} as AiRuntimeProfile;
}

export async function getAiProviderChain(env:Runtime,primary:AiSettingsRow){
  const chain=[await profile(env,primary,"primary")];
  const fallback=await env.DB.prepare("SELECT provider,base_url,model,enabled,config_json,secret_ciphertext FROM ai_provider_fallbacks WHERE id='default'").first<FallbackRow>();
  if(fallback?.enabled)chain.push(await profile(env,fallback,"fallback"));
  return chain;
}

export function getEffectiveAiDataPolicy(chain:AiRuntimeProfile[]){
  return {maxDataClassification:strictestDataClassification(chain),profiles:chain.map(item=>({profile:item.profile,trustZone:item.trustZone,maxDataClassification:item.maxDataClassification}))};
}

async function health(db:D1Database,item:AiRuntimeProfile,operation:string,status:"success"|"error"|"denied",latency:number,detail:string){
  await db.prepare("INSERT INTO ai_provider_health(id,profile,provider,model,operation,status,latency_ms,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),item.profile,item.provider,item.model,operation,status,Math.max(0,Math.round(latency)),detail.slice(0,500),new Date().toISOString()).run();
}

export async function callAiWithFailover(db:D1Database,chain:AiRuntimeProfile[],messages:AiMessage[],operation:string,actor="system"){
  const failures:string[]=[];let budgetFailures=0;
  for(const item of chain){const started=Date.now();try{await enforceAiBudget(db,item.profile);const response=await callAiProvider(item,messages);let usageRecorded=true;try{await recordAiUsage(db,{actor,operation,profile:item.profile,provider:item.provider,model:item.model,usage:response.usage});}catch{usageRecorded=false;}const usageDetail=response.usage.metered?`${response.usage.promptTokens+response.usage.completionTokens} tokens metered`:"provider usage unavailable";await health(db,item,operation,"success",Date.now()-started,`Provider call completed; ${usageDetail}${usageRecorded?"":"; usage ledger write failed"}`);return {content:response.content,usage:response.usage,provider:item.provider,model:item.model,profile:item.profile,failures};}catch(error){const message=error instanceof Error?error.message:"Provider call failed",budgetExceeded=isAiBudgetExceeded(error);if(budgetExceeded)budgetFailures++;failures.push(`${item.profile}:${message}`);await health(db,item,operation,budgetExceeded?"denied":"error",Date.now()-started,message);}}
  if(budgetFailures===chain.length)throw new AiBudgetExceededError("Etkin AI sağlayıcılarının aylık token bütçesi doldu.");
  throw new Error(`AI sağlayıcı zinciri başarısız: ${failures.join(" | ")}`);
}
