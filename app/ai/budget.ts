import { boundedNumber,cleanAiText } from "./security";

export const AI_BUDGET_PROFILES=["primary","fallback"] as const;
export type AiBudgetProfile=typeof AI_BUDGET_PROFILES[number];
export type AiUsage={promptTokens:number;completionTokens:number;metered:boolean};
export class AiBudgetExceededError extends Error{}
export const isAiBudgetExceeded=(error:unknown)=>error instanceof AiBudgetExceededError;

export function normalizeAiUsage(prompt:unknown,completion:unknown):AiUsage{
  const promptTokens=Math.max(0,Math.trunc(Number(prompt)||0)),completionTokens=Math.max(0,Math.trunc(Number(completion)||0));
  return {promptTokens,completionTokens,metered:promptTokens+completionTokens>0};
}

export function validateAiBudgetPolicy(input:Record<string,unknown>){
  const profile=cleanAiText(input.profile,20) as AiBudgetProfile;
  if(!AI_BUDGET_PROFILES.includes(profile))throw new Error("Bütçe provider profili geçersiz.");
  const monthlyTokenLimit=Math.trunc(boundedNumber(input.monthlyTokenLimit,0,0,1_000_000_000));
  const warnPercent=Math.trunc(boundedNumber(input.warnPercent,80,50,100));
  const promptCostPerMillion=boundedNumber(input.promptCostPerMillion,0,0,100_000);
  const completionCostPerMillion=boundedNumber(input.completionCostPerMillion,0,0,100_000);
  const currency=cleanAiText(input.currency,3).toUpperCase()||"USD";
  if(!/^[A-Z]{3}$/.test(currency))throw new Error("Para birimi üç harfli ISO kodu olmalıdır.");
  return {profile,monthlyTokenLimit,warnPercent,hardLimit:input.hardLimit===true,promptCostPerMillion,completionCostPerMillion,currency};
}

export function estimatedCostMicrounits(usage:AiUsage,promptCostPerMillion:number,completionCostPerMillion:number){
  return Math.max(0,Math.round(usage.promptTokens*promptCostPerMillion+usage.completionTokens*completionCostPerMillion));
}

export async function enforceAiBudget(db:D1Database,profile:AiBudgetProfile){
  const policy=await db.prepare("SELECT monthly_token_limit,hard_limit FROM ai_budget_policies WHERE profile=?").bind(profile).first<{monthly_token_limit:number;hard_limit:number}>();
  if(!policy?.hard_limit||Number(policy.monthly_token_limit)<=0)return;
  const usage=await db.prepare("SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) tokens FROM ai_usage_ledger WHERE profile=? AND created_at>=date('now','start of month')").bind(profile).first<{tokens:number}>();
  if(Number(usage?.tokens||0)>=Number(policy.monthly_token_limit))throw new AiBudgetExceededError(`${profile==="primary"?"Birincil":"Yedek"} AI sağlayıcısının aylık token bütçesi doldu.`);
}

export async function recordAiUsage(db:D1Database,input:{actor:string;operation:string;profile:AiBudgetProfile;provider:string;model:string;usage:AiUsage}){
  const policy=await db.prepare("SELECT prompt_cost_per_million,completion_cost_per_million,currency FROM ai_budget_policies WHERE profile=?").bind(input.profile).first<{prompt_cost_per_million:number;completion_cost_per_million:number;currency:string}>();
  const cost=estimatedCostMicrounits(input.usage,Number(policy?.prompt_cost_per_million||0),Number(policy?.completion_cost_per_million||0));
  await db.prepare("INSERT INTO ai_usage_ledger(id,actor,operation,profile,provider,model,prompt_tokens,completion_tokens,estimated_cost_microunits,currency,metered,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),cleanAiText(input.actor,320)||"system",cleanAiText(input.operation,80),input.profile,cleanAiText(input.provider,80),cleanAiText(input.model,200),input.usage.promptTokens,input.usage.completionTokens,cost,policy?.currency||"USD",input.usage.metered?1:0,new Date().toISOString()).run();
}
