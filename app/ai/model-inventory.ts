import { cleanAiText,redactSensitiveText } from "./security";

export const AI_MODEL_DEPLOYMENTS=["External SaaS","Private Cloud","On-Prem","Local"] as const;
export const AI_MODEL_DATA_CLASSES=["Public","Internal","Confidential","Restricted"] as const;
export const AI_MODEL_AUTONOMY=["Advisory","Human-reviewed","Human-approved","Autonomous"] as const;
export type AiModelStatus="draft"|"approved"|"suspended"|"retired";

const validDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;};
const score=(value:unknown)=>Math.round(Number(value));

export function calculateAiModelRisk(input:{impact:number;likelihood:number;dataSensitivity:number;autonomyRisk:number;controlMaturity:number}){
  const inherent=input.impact*input.likelihood+input.dataSensitivity+input.autonomyRisk;
  const residual=Math.max(1,Math.round(inherent*(1-(input.controlMaturity-1)*0.18)));
  const tier=residual>=20?"Critical":residual>=13?"High":residual>=7?"Medium":"Low";
  return{inherentScore:inherent,residualScore:residual,riskTier:tier as "Low"|"Medium"|"High"|"Critical"};
}

export function validateAiModel(input:Record<string,unknown>){
  const value={systemName:redactSensitiveText(input.systemName,160),modelName:redactSensitiveText(input.modelName,160),vendor:redactSensitiveText(input.vendor,160),purpose:redactSensitiveText(input.purpose,1600),owner:redactSensitiveText(input.owner,320),deployment:cleanAiText(input.deployment,40),region:redactSensitiveText(input.region,120),dataClassification:cleanAiText(input.dataClassification,40),autonomy:cleanAiText(input.autonomy,40),affectedUsers:Math.max(0,Math.min(10_000_000,Math.round(Number(input.affectedUsers)||0))),impact:score(input.impact),likelihood:score(input.likelihood),dataSensitivity:score(input.dataSensitivity),autonomyRisk:score(input.autonomyRisk),controlMaturity:score(input.controlMaturity),controls:redactSensitiveText(input.controls,2000),reviewDate:cleanAiText(input.reviewDate,10)};
  if(value.systemName.length<3||value.modelName.length<2||value.vendor.length<2||value.purpose.length<10||value.owner.length<3)throw new Error("Sistem, model, sağlayıcı, amaç ve sorumlu zorunludur.");
  if(!AI_MODEL_DEPLOYMENTS.includes(value.deployment as typeof AI_MODEL_DEPLOYMENTS[number])||!AI_MODEL_DATA_CLASSES.includes(value.dataClassification as typeof AI_MODEL_DATA_CLASSES[number])||!AI_MODEL_AUTONOMY.includes(value.autonomy as typeof AI_MODEL_AUTONOMY[number]))throw new Error("Model sınıflandırması geçersiz.");
  if(value.deployment==="External SaaS"&&value.dataClassification==="Restricted")throw new Error("Restricted veri harici SaaS modele atanamaz.");
  if(![value.impact,value.likelihood,value.dataSensitivity,value.autonomyRisk,value.controlMaturity].every(n=>Number.isInteger(n)&&n>=1&&n<=5))throw new Error("Risk faktörleri 1 ile 5 arasında olmalıdır.");
  if(value.controls.length<5)throw new Error("Uygulanan kontrolleri açıklayın.");if(!validDate(value.reviewDate))throw new Error("Geçerli bir inceleme tarihi gereklidir.");
  const risk=calculateAiModelRisk(value);if(value.autonomy==="Autonomous"&&risk.riskTier==="Critical")throw new Error("Kritik riskli model Autonomous karar rolüyle kaydedilemez.");return{...value,...risk};
}
