import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { clean } from "../../integrations/security";
import { assuranceEscalationNavigation } from "../../../assurance-escalation-navigation";

type Env=Record<string,unknown>&{DB:D1Database};
type Target={module:string;ref:string;filterKey:"recordRef"|"riskRef"|"controlRef"|"evidenceRef"|"findingRef"|"ruleRef"|"sourceRef"};
type SimpleRow={id:string;module:string;data_json:string};

async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string|undefined|null)=>{try{const parsed=JSON.parse(value||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return {}}};
const text=(value:unknown)=>String(value??"").normalize("NFKC").trim();

function simpleTarget(row:SimpleRow):Target|undefined{
 const data=parse(row.data_json);
 if(row.module==="Risk Assessment"){const ref=text(data.riskId||data.code||row.id);return ref?{module:row.module,ref,filterKey:"riskRef"}:undefined}
 if(row.module==="Kontroller"){const ref=text(data.controlId||data.controlCode||data.code||data.reference||row.id);return ref?{module:row.module,ref,filterKey:"controlRef"}:undefined}
 if(row.module==="Kanıtlar"){const ref=text(data.evidenceId||data.code||row.id);return ref?{module:row.module,ref,filterKey:"evidenceRef"}:undefined}
 if(row.module==="Bulgular ve CAPA"){const ref=text(data.findingCode||data.code||data.findingId||"");return ref?{module:row.module,ref,filterKey:"findingRef"}:undefined}
 return undefined;
}

async function canonicalFindingCode(db:D1Database,id:string){try{const row=await db.prepare("SELECT code FROM enterprise_findings WHERE id=? LIMIT 1").bind(id).first<{code:string}>();return text(row?.code)}catch{return ""}}

async function resolveTarget(db:D1Database,sourceId:string):Promise<Target|undefined>{
 if(sourceId==="CA-SUMMARY"||sourceId==="CA-GOVERNANCE-SUMMARY"||sourceId==="EVIDENCE-LINEAGE-SUMMARY")return undefined;
 if(sourceId.startsWith("CA-RISK-REVIEW-")){
  const id=sourceId.slice("CA-RISK-REVIEW-".length);try{const row=await db.prepare("SELECT risk_id FROM continuous_assurance_risk_reviews WHERE id=? LIMIT 1").bind(id).first<{risk_id:string}>();const ref=text(row?.risk_id);return ref?{module:"Risk Assessment",ref,filterKey:"riskRef"}:undefined}catch{return undefined}
 }
 if(sourceId.startsWith("CA-EXCEPTION-")){
  const id=sourceId.slice("CA-EXCEPTION-".length);try{const row=await db.prepare("SELECT finding_id,rule_id,control_ref,risk_ref FROM continuous_assurance_exceptions WHERE id=? LIMIT 1").bind(id).first<{finding_id:string;rule_id:string;control_ref:string;risk_ref:string}>();if(!row)return undefined;const control=text(row.control_ref),risk=text(row.risk_ref),rule=text(row.rule_id),finding=text(row.finding_id);if(control)return{module:"Kontroller",ref:control,filterKey:"controlRef"};if(risk)return{module:"Risk Assessment",ref:risk,filterKey:"riskRef"};if(rule)return{module:"Kanıt Otomasyonu",ref:rule,filterKey:"ruleRef"};if(finding)return{module:"Kanıt Otomasyonu",ref:finding,filterKey:"findingRef"};return undefined}catch{return undefined}
 }
 if(sourceId.startsWith("CA-ESCALATION-")){
  const id=sourceId.slice("CA-ESCALATION-".length);try{const row=await db.prepare("SELECT kind,source_json FROM continuous_assurance_escalations WHERE id=? LIMIT 1").bind(id).first<{kind:string;source_json:string}>();if(!row)return undefined;const source=parse(row.source_json),findingId=text(source.findingId);if(findingId&&!text(source.findingCode)){const code=await canonicalFindingCode(db,findingId);if(code)source.findingCode=code}const navigation=assuranceEscalationNavigation(row.kind,source);return navigation?{module:navigation.module,ref:navigation.recordRef,filterKey:navigation.filterKey}:undefined}catch{return undefined}
 }
 if(sourceId.startsWith("CA-CONTROL-")){
  const ref=text(sourceId.slice("CA-CONTROL-".length));return ref?{module:"Kanıt Otomasyonu",ref,filterKey:"ruleRef"}:undefined;
 }
 if(sourceId.startsWith("CA-FINDING-")){
  const ref=text(sourceId.slice("CA-FINDING-".length));return ref?{module:"Kanıt Otomasyonu",ref,filterKey:"findingRef"}:undefined;
 }
 if(sourceId.startsWith("CA-WORK-")){
  const id=sourceId.slice("CA-WORK-".length);try{const row=await db.prepare("SELECT finding_id,rule_id,action,result_ref FROM continuous_assurance_work_items WHERE id=? LIMIT 1").bind(id).first<{finding_id:string;rule_id:string;action:string;result_ref:string|null}>();if(!row)return undefined;if(row.action==="capa-promotion"&&row.result_ref){const code=await canonicalFindingCode(db,row.result_ref);if(code)return{module:"Bulgular ve CAPA",ref:code,filterKey:"findingRef"}}const rule=text(row.rule_id),finding=text(row.finding_id);if(rule)return{module:"Kanıt Otomasyonu",ref:rule,filterKey:"ruleRef"};if(finding)return{module:"Kanıt Otomasyonu",ref:finding,filterKey:"findingRef"};return undefined}catch{return undefined}
 }
 try{const row=await db.prepare("SELECT id,module,data_json FROM simple_grc_records WHERE id=? LIMIT 1").bind(sourceId).first<SimpleRow>();if(row)return simpleTarget(row)}catch{}
 return undefined;
}

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const sourceId=clean(req.nextUrl.searchParams.get("sourceId"),180);if(!sourceId)return json({error:"Source ID gerekli."},400);
 const env=await runtime(),target=await resolveTarget(env.DB,sourceId);if(!target)return json({target:null},404);
 return json({target});
}
