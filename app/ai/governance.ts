import { cleanAiText,redactSensitiveText } from "./security";

export const AI_DATA_CLASSES=["Public","Internal","Confidential","Restricted"] as const;
export const AI_IMPACT_LEVELS=["Low","Medium","High","Critical"] as const;
export const AI_DECISION_ROLES=["Assistive","Human-reviewed","Human-approved","Prohibited"] as const;
const validDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;};
function list(value:unknown,max=20){const rows=Array.isArray(value)?value:String(value||"").split(",");return [...new Set(rows.map(item=>redactSensitiveText(item,160)).filter(Boolean))].slice(0,max);}

export function validateUseCase(input:Record<string,unknown>){
  const result={name:redactSensitiveText(input.name,160),purpose:redactSensitiveText(input.purpose,1600),owner:redactSensitiveText(input.owner,320),dataClassification:cleanAiText(input.dataClassification,40),impactLevel:cleanAiText(input.impactLevel,40),decisionRole:cleanAiText(input.decisionRole,40),controls:list(input.controls),reviewDate:cleanAiText(input.reviewDate,10)};
  if(result.name.length<3||result.purpose.length<10||!result.owner)throw new Error("Ad, amaç ve sorumlu alanları zorunludur.");
  if(!AI_DATA_CLASSES.includes(result.dataClassification as typeof AI_DATA_CLASSES[number])||!AI_IMPACT_LEVELS.includes(result.impactLevel as typeof AI_IMPACT_LEVELS[number])||!AI_DECISION_ROLES.includes(result.decisionRole as typeof AI_DECISION_ROLES[number]))throw new Error("AI risk sınıflandırması geçersiz.");
  if(!validDate(result.reviewDate))throw new Error("Geçerli bir gözden geçirme tarihi gereklidir.");
  if(!result.controls.length)throw new Error("En az bir risk kontrolü gereklidir.");
  return result;
}

export function validateEvalCase(input:Record<string,unknown>){
  const result={name:redactSensitiveText(input.name,160),input:redactSensitiveText(input.input,2000),expectedTerms:list(input.expectedTerms,15),forbiddenTerms:list(input.forbiddenTerms,15),maxLatencyMs:Math.min(120000,Math.max(1000,Math.round(Number(input.maxLatencyMs)||30000))),enabled:input.enabled!==false};
  if(result.name.length<3||result.input.length<3)throw new Error("Test adı ve girdisi zorunludur.");
  if(!result.expectedTerms.length&&!result.forbiddenTerms.length)throw new Error("En az bir beklenen veya yasaklı terim gereklidir.");
  return result;
}

export async function sha256(value:string){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
export function scoreEvaluation(output:string,expected:string[],forbidden:string[],latency:number,maxLatency:number){const text=output.toLocaleLowerCase("tr-TR"),expectedHits=expected.filter(term=>text.includes(term.toLocaleLowerCase("tr-TR"))).length,forbiddenHits=forbidden.filter(term=>text.includes(term.toLocaleLowerCase("tr-TR"))).length;const coverage=expected.length?expectedHits/expected.length:1;const score=Math.max(0,Math.round(coverage*80+(latency<=maxLatency?20:0)-forbiddenHits*40));return {score,status:score>=80&&forbiddenHits===0?"passed":"failed",failureReason:[expectedHits<expected.length?`Beklenen terim: ${expectedHits}/${expected.length}`:"",forbiddenHits?`Yasaklı terim: ${forbiddenHits}`:"",latency>maxLatency?`Gecikme limiti aşıldı (${latency} ms)`:""].filter(Boolean).join("; ")};}
