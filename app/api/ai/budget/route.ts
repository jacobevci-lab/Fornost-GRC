import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { AI_BUDGET_PROFILES,type AiBudgetProfile,validateAiBudgetPolicy } from "@/app/ai/budget";
import { aiRuntime,recordAiEvent } from "@/app/ai/storage";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const number=(value:unknown)=>Number(value||0);
const defaultPolicy=(profile:AiBudgetProfile)=>({profile,monthlyTokenLimit:0,warnPercent:80,hardLimit:false,promptCostPerMillion:0,completionCostPerMillion:0,currency:"USD",updatedBy:"",updatedAt:""});

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const {DB}=await aiRuntime(),month=new Date().toISOString().slice(0,7);
  const [policies,totals,actors,operations,recent]=await Promise.all([
    DB.prepare("SELECT * FROM ai_budget_policies ORDER BY profile").all<Record<string,unknown>>(),
    DB.prepare("SELECT profile,COUNT(*) calls,SUM(prompt_tokens) prompt_tokens,SUM(completion_tokens) completion_tokens,SUM(estimated_cost_microunits) cost,SUM(CASE WHEN metered=0 THEN 1 ELSE 0 END) unmetered FROM ai_usage_ledger WHERE created_at>=date('now','start of month') GROUP BY profile").all<Record<string,unknown>>(),
    DB.prepare("SELECT actor,SUM(prompt_tokens+completion_tokens) tokens,COUNT(*) calls FROM ai_usage_ledger WHERE created_at>=date('now','start of month') GROUP BY actor ORDER BY tokens DESC,calls DESC LIMIT 20").all<Record<string,unknown>>(),
    DB.prepare("SELECT operation,SUM(prompt_tokens+completion_tokens) tokens,COUNT(*) calls FROM ai_usage_ledger WHERE created_at>=date('now','start of month') GROUP BY operation ORDER BY tokens DESC,calls DESC LIMIT 20").all<Record<string,unknown>>(),
    DB.prepare("SELECT actor,operation,profile,provider,model,prompt_tokens,completion_tokens,estimated_cost_microunits,currency,metered,created_at FROM ai_usage_ledger ORDER BY created_at DESC LIMIT 100").all<Record<string,unknown>>(),
  ]);
  const policyMap=new Map((policies.results||[]).map(row=>[String(row.profile),row])),totalMap=new Map((totals.results||[]).map(row=>[String(row.profile),row]));
  const profiles=AI_BUDGET_PROFILES.map(profile=>{const row=policyMap.get(profile),usage=totalMap.get(profile),base=row?{profile,monthlyTokenLimit:number(row.monthly_token_limit),warnPercent:number(row.warn_percent),hardLimit:!!row.hard_limit,promptCostPerMillion:number(row.prompt_cost_per_million),completionCostPerMillion:number(row.completion_cost_per_million),currency:String(row.currency||"USD"),updatedBy:String(row.updated_by||""),updatedAt:String(row.updated_at||"")}:defaultPolicy(profile),tokens=number(usage?.prompt_tokens)+number(usage?.completion_tokens),usagePercent=base.monthlyTokenLimit?Math.round(tokens*1000/base.monthlyTokenLimit)/10:0;return {...base,calls:number(usage?.calls),promptTokens:number(usage?.prompt_tokens),completionTokens:number(usage?.completion_tokens),tokens,estimatedCost:number(usage?.cost)/1_000_000,unmeteredCalls:number(usage?.unmetered),usagePercent,state:base.monthlyTokenLimit&&usagePercent>=100?"exceeded":base.monthlyTokenLimit&&usagePercent>=base.warnPercent?"warning":"ready"};});
  return json({month,profiles,actors:(actors.results||[]).map(row=>({actor:row.actor,tokens:number(row.tokens),calls:number(row.calls)})),operations:(operations.results||[]).map(row=>({operation:row.operation,tokens:number(row.tokens),calls:number(row.calls)})),recent:(recent.results||[]).map(row=>({actor:row.actor,operation:row.operation,profile:row.profile,provider:row.provider,model:row.model,promptTokens:number(row.prompt_tokens),completionTokens:number(row.completion_tokens),estimatedCost:number(row.estimated_cost_microunits)/1_000_000,currency:row.currency,metered:!!row.metered,createdAt:row.created_at}))});
}

export async function PUT(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8_192)return json({error:"AI bütçe isteği çok büyük."},413);
  let value;try{value=validateAiBudgetPolicy(await req.json().catch(()=>({})));}catch(error){return json({error:error instanceof Error?error.message:"AI bütçe politikası doğrulanamadı."},400);}
  const {DB}=await aiRuntime(),now=new Date().toISOString();
  await DB.prepare("INSERT INTO ai_budget_policies(profile,monthly_token_limit,warn_percent,hard_limit,prompt_cost_per_million,completion_cost_per_million,currency,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(profile) DO UPDATE SET monthly_token_limit=excluded.monthly_token_limit,warn_percent=excluded.warn_percent,hard_limit=excluded.hard_limit,prompt_cost_per_million=excluded.prompt_cost_per_million,completion_cost_per_million=excluded.completion_cost_per_million,currency=excluded.currency,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(value.profile,value.monthlyTokenLimit,value.warnPercent,value.hardLimit?1:0,value.promptCostPerMillion,value.completionCostPerMillion,value.currency,access.actor.email,now).run();
  await recordAiEvent(DB,{actor:access.actor.email,action:"budget-policy-save",status:"success",detail:`${value.profile} budget ${value.monthlyTokenLimit||"unlimited"} tokens; warning ${value.warnPercent}%; hard limit ${value.hardLimit}`});
  return json({ok:true});
}
