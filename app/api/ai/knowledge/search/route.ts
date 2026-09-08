import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../../../auth/security";
import { searchApprovedKnowledge } from "@/app/ai/knowledge";
import { sha256 } from "@/app/ai/governance";
import { redactSensitiveText } from "@/app/ai/security";
import { aiRuntime,getAiSettings,recordAiEvent } from "@/app/ai/storage";
import { getAiProviderChain,getEffectiveAiDataPolicy } from "@/app/ai/runtime-provider";

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});

export async function POST(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>8_192)return json({error:"Arama isteği çok büyük."},413);
  const body=await req.json().catch(()=>({})),query=redactSensitiveText(body.query,1000);
  if(query.length<3)return json({error:"En az 3 karakterlik arama yazın."},400);
  const env=await aiRuntime(),primary=await getAiSettings(env.DB);
  const dataPolicy=primary?.enabled?getEffectiveAiDataPolicy(await getAiProviderChain(env,primary)):{maxDataClassification:"Confidential" as const,profiles:[]};
  const matches=await searchApprovedKnowledge(env.DB,query,dataPolicy.maxDataClassification),queryHash=await sha256(query);
  await recordAiEvent(env.DB,{actor:access.actor.email,action:"knowledge-search",promptHash:queryHash,contextRefs:matches.map(item=>item.ref),status:"success",detail:`Retrieval lab returned ${matches.length} approved grounded chunks; max ${dataPolicy.maxDataClassification}; raw query not stored`});
  return json({matches:matches.map(item=>({ref:item.ref,sourceId:item.sourceId,name:item.name,classification:item.classification,version:item.version,chunk:item.ordinal+1,score:item.score,preview:item.content.slice(0,600)})),queryHash,dataPolicy});
}
