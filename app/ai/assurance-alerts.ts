import { cleanAiText, redactSensitiveText } from "./security";
import type { AssuranceSnapshot } from "./continuous-assurance";

export const ALERT_METRICS=["measurement","accuracy","error-rate","drift","bias","latency","sample-size"] as const;
export type AlertMetric=(typeof ALERT_METRICS)[number];
export type AlertSeverity="Medium"|"High"|"Critical";
type Policy={minAccuracy:number;maxErrorRate:number;maxDriftScore:number;maxBiasScore:number;maxP95LatencyMs:number;minSampleSize:number;frequencyDays:number};

export function assuranceAlertCandidates(policy:Policy,snapshot:AssuranceSnapshot|null,riskTier:string,today=new Date().toISOString()){
  const highRisk=["High","Critical"].includes(riskTier), result:{metric:AlertMetric;severity:AlertSeverity;observed:number|null;threshold:number|null;title:string}[]=[];
  if(!snapshot)return[{metric:"measurement" as const,severity:highRisk?"Critical" as const:"High" as const,observed:null,threshold:policy.frequencyDays,title:"İzleme ölçümü bulunamadı"}];
  const cutoff=new Date(today);cutoff.setUTCDate(cutoff.getUTCDate()-policy.frequencyDays);
  if(new Date(snapshot.recordedAt)<cutoff)result.push({metric:"measurement",severity:highRisk?"High":"Medium",observed:Math.floor((new Date(today).getTime()-new Date(snapshot.recordedAt).getTime())/86400000),threshold:policy.frequencyDays,title:"İzleme ölçümü gecikmiş"});
  const low=(metric:AlertMetric,observed:number,threshold:number,title:string)=>{if(observed<threshold)result.push({metric,severity:observed<threshold*.8?"Critical":highRisk?"High":"Medium",observed,threshold,title});};
  const high=(metric:AlertMetric,observed:number,threshold:number,title:string)=>{if(observed>threshold)result.push({metric,severity:observed>threshold*1.5?"Critical":highRisk?"High":"Medium",observed,threshold,title});};
  low("accuracy",snapshot.accuracy,policy.minAccuracy,"Doğruluk baseline altında");high("error-rate",snapshot.errorRate,policy.maxErrorRate,"Hata oranı baseline üstünde");high("drift",snapshot.driftScore,policy.maxDriftScore,"Drift baseline üstünde");high("bias",snapshot.biasScore,policy.maxBiasScore,"Bias baseline üstünde");high("latency",snapshot.p95LatencyMs,policy.maxP95LatencyMs,"P95 gecikme baseline üstünde");low("sample-size",snapshot.sampleSize,policy.minSampleSize,"Örneklem baseline altında");return result;
}
export async function alertFingerprint(modelId:string,policyId:string,metric:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${modelId}:${policyId}:${metric}`));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
export function validateAlertAction(input:Record<string,unknown>){const action=cleanAiText(input.action,20),note=redactSensitiveText(input.note,1200),owner=redactSensitiveText(input.owner,320),confirmation=cleanAiText(input.confirmation,40),expected:Record<string,string>={acknowledge:"ALARMI KABUL ET",escalate:"CAPA OLUŞTUR",resolve:"ALARMI ÇÖZ",reopen:"ALARMI YENİDEN AÇ"};if(!expected[action]||note.length<10||confirmation!==expected[action])throw new Error(`Geçerli işlem, açıklama ve onay metni zorunludur: ${expected[action]||"bilinmiyor"}`);if(action==="acknowledge"&&owner.length<3)throw new Error("Alarm sorumlusu zorunludur.");return{action,note,owner};}
