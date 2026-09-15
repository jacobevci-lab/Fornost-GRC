import { cleanAiText, redactSensitiveText } from "./security";

export const AI_DATA_DISPOSITIONS = ["delete", "anonymize", "archive", "legal-hold"] as const;
const realDate = (value:string) => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date=new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value; };

export function validateDecommissionPlan(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)) {
  const value={modelId:cleanAiText(input.modelId,100),replacementModelId:cleanAiText(input.replacementModelId,100),reason:redactSensitiveText(input.reason,1600),owner:redactSensitiveText(input.owner,320),plannedAt:cleanAiText(input.plannedAt,10),dependencies:redactSensitiveText(input.dependencies,2000),stakeholderPlan:redactSensitiveText(input.stakeholderPlan,1600),rollbackPlan:redactSensitiveText(input.rollbackPlan,1600),dataDisposition:cleanAiText(input.dataDisposition,20),retentionBasis:redactSensitiveText(input.retentionBasis,1200),disposalMethod:redactSensitiveText(input.disposalMethod,1200),artifactPlan:redactSensitiveText(input.artifactPlan,1200),accessPlan:redactSensitiveText(input.accessPlan,1200),evidencePlan:redactSensitiveText(input.evidencePlan,1200)};
  if(!value.modelId||value.replacementModelId===value.modelId)throw new Error("Model ve farklı bir yedek model seçimi zorunludur.");
  if(value.reason.length<20||value.owner.length<3||value.dependencies.length<20||value.stakeholderPlan.length<20||value.rollbackPlan.length<20||value.disposalMethod.length<20||value.artifactPlan.length<20||value.accessPlan.length<20||value.evidencePlan.length<20)throw new Error("Emeklilik gerekçesi, bağımlılıklar, iletişim, rollback, veri, artifact, erişim ve kanıt planları eksiksiz olmalıdır.");
  if(!AI_DATA_DISPOSITIONS.includes(value.dataDisposition as (typeof AI_DATA_DISPOSITIONS)[number]))throw new Error("Geçerli veri saklama veya imha kararı zorunludur.");
  if(["archive","legal-hold"].includes(value.dataDisposition)&&value.retentionBasis.length<10)throw new Error("Arşiv veya legal hold için saklama dayanağı zorunludur.");
  if(!realDate(value.plannedAt)||value.plannedAt<today)throw new Error("Bugün veya ileri tarihli emeklilik tarihi zorunludur.");
  return value;
}

export function validateDecommissionAction(input:Record<string,unknown>){
  const action=cleanAiText(input.action,20),note=redactSensitiveText(input.note,1200),confirmation=cleanAiText(input.confirmation,40),evidenceReference=redactSensitiveText(input.evidenceReference,300),evidenceSha256=cleanAiText(input.evidenceSha256,64).toLowerCase();
  if(!["approve","start","verify","reject"].includes(action)||note.length<10)throw new Error("Geçerli işlem ve en az 10 karakter açıklama zorunludur.");
  const expected:Record<string,string>={approve:"PLANI ONAYLA",start:"EMEKLİLİĞİ BAŞLAT",verify:"İMHAYI DOĞRULA",reject:"PLANI REDDET"};
  if(confirmation!==expected[action])throw new Error(`Onay metni: ${expected[action]}`);
  if(["start","verify"].includes(action)&&(evidenceReference.length<5||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw new Error("İcra ve doğrulama için kanıt referansı ile SHA-256 zorunludur.");
  const checks=["trafficDisabled","accessRevoked","secretsRevoked","dependenciesMigrated","dataDispositioned","artifactsDispositioned","monitoringClosed"] as const;
  if(action==="verify"&&checks.some(key=>input[key]!==true))throw new Error("Tüm emeklilik doğrulama kontrolleri tamamlanmalıdır.");
  return{action,note,confirmation,evidenceReference,evidenceSha256,checks:Object.fromEntries(checks.map(key=>[key,input[key]===true]))};
}

export function decommissionAttention(status:string,plannedAt:string,today=new Date().toISOString().slice(0,10)){return status!=="completed"&&status!=="rejected"&&plannedAt<today?"overdue":status;}
