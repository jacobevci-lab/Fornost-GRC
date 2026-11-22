import {validVendorEvidenceRefs} from "./third-party-risk/inventory";
import { biaRecoveryFields, exceedsMtpd, sameBiaPerson, mtpdWarning, sodWarning } from "./bia-assessment";
import { hasRecoveryTarget } from "./bia-recovery";
import { assetLifecycle, assetStatuses } from "./asset-inventory-model";
import { assessedResidualRiskScore } from "./risk-methodology";
import { isResidualRiskGoverned } from "./risk-governance-write";
import { assuranceRiskLevel } from "./assurance-governance";
export const modules=["Risk Assessment","BIA","Varlık Envanteri","Uyum","Tedarikçiler","Kontroller","Kanıtlar","Denetim Yönetimi"] as const;
export type ModuleName=(typeof modules)[number];
export type Data=Record<string,unknown>;
const required:Record<ModuleName,string[]>={
 "Risk Assessment":["title","owner","asset"],
 BIA:["process","processCategory","businessUnit","owner","criticality","asset","rto","rpo","status"],
 "Varlık Envanteri":["title","assetType","businessUnit","owner","criticality","status"],
 Uyum:["framework","controlRef","controlTitle","owner","status"],
 Tedarikçiler:["title","service","owner","criticality","riskLevel","status"],
 Kontroller:["controlRef","controlTitle","owner","frequency","implementation","status"],
 Kanıtlar:["evidenceTitle","controlRef","owner","period","status"],
 "Denetim Yönetimi":["auditName","auditType","auditOwner","startDate","endDate","requirementRef","requirementTitle","owner","businessUnit","dueDate","status","progress"]
};
const riskAssessmentFields=["category","businessUnit","inherentLikelihood","inherentImpact","treatment","nextReview"] as const;
const allowedStatuses:Record<ModuleName,string[]>={
 "Risk Assessment":["Açık","Değerlendiriliyor","Aksiyon Devam Ediyor","Kabul Edildi","Kapalı"],
 BIA:["Taslak","İncelemede","Onaylandı","Aktif","Arşivlendi"],
 "Varlık Envanteri":assetStatuses,
 Uyum:["Uyumlu","Kısmi Uyumlu","Uyumlu Değil","Uygulanamaz"],
 Tedarikçiler:["Aktif","İncelemede","Askıda","Sonlandırıldı"],
 Kontroller:["Taslak","Aktif","İyileştirme Gerekli","Devre Dışı"],
 Kanıtlar:["Taslak","İncelemede","Onaylandı","Reddedildi","Süresi Doldu"],
 "Denetim Yönetimi":["Başlanmadı","Devam Ediyor","İncelemede","Kapatıldı"],
};
export function cleanText(value:unknown,max=1000){return typeof value==="string"?value.trim().slice(0,max):value}
export function validModule(value:unknown):value is ModuleName{return typeof value==="string"&&modules.includes(value as ModuleName)}
export function validDate(value:unknown){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
export function normalizeRecordData(module:unknown,input:Data){
 const data={...input};
 if(module==="Risk Assessment"){
  if(data.inherentLikelihood===undefined&&data.likelihood!==undefined)data.inherentLikelihood=data.likelihood;
  if(data.inherentImpact===undefined&&data.impact!==undefined)data.inherentImpact=data.impact;
  delete data.likelihood;delete data.impact;
  if(data.status==="Devam Ediyor")data.status="Aksiyon Devam Ediyor";
  if(data.status==="İzlemede")data.status="Değerlendiriliyor";
  if(!data.status)data.status="Değerlendiriliyor";
 }
 if(module==="Varlık Envanteri"){
  data.status=assetLifecycle(data);delete data.lifecycleStage;
  if(typeof data.dependencyRefs==="string")data.dependencyRefs=data.dependencyRefs.split(/[;,|\n]+/).map(v=>v.trim()).filter(Boolean);
  if(Array.isArray(data.dependencyRefs))data.dependencyRefs=[...new Set(data.dependencyRefs)];
 }
 if(module==="BIA"){
  if(!data.processCategory)data.processCategory="Operasyonel Süreç";
  if(!data.status)data.status="Aktif";
  for(const key of biaRecoveryFields){
   const value=data[key];
   if(typeof value!=="string")continue;
   const hours=/^(\d+(?:[.,]\d+)?)\s*(?:saat|hours?|hrs?|h)$/i.exec(value.trim());
   if(hours)data[key]=hours[1].replace(",",".");
  }
 }
 if(module==="Uyum"){if(data.status==="Kısmi")data.status="Kısmi Uyumlu";if(data.status==="Uyumsuz")data.status="Uyumlu Değil"}
 if(module==="Tedarikçiler"&&data.status==="İyileştirme Gerekli")data.status="Askıda";
 if(module==="Denetim Yönetimi"){if(data.status==="Planlandı")data.status="Başlanmadı";if(data.status==="Tamamlandı")data.status="Kapatıldı";if(data.status==="Gecikmiş")data.status="Devam Ediyor"}
 if(module==="Kanıtlar"&&!data.status)data.status="Taslak";
 if(module==="Kontroller"&&!data.implementation&&["Uygulanıyor","Kısmi","Uygulama Hazırlığında","Uygulanmıyor","Uygulanamaz"].includes(String(data.status||""))){
  data.implementation=data.status;
  data.status=data.status==="Uygulanıyor"?"Aktif":data.status==="Uygulanamaz"?"Devre Dışı":data.status==="Uygulanmıyor"?"Taslak":"İyileştirme Gerekli";
 }
 return data;
}
export function validate(module:unknown,input:unknown,previousStatus?:unknown){
 if(!validModule(module))return {error:"Geçersiz modül."};
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Geçersiz kayıt verisi."};
 const source=input as Data,cleaned:Data={};
 for(const [key,value] of Object.entries(source)){if(key.length>60)continue;
  if(module==="Risk Assessment" && ["asset","existingControls","controlImplementationNote"].includes(key) && typeof value==="string"){
    const limit=key==="controlImplementationNote"?2000:32000;
    if(value.length>limit)return {error:`${key} izin verilen uzunluğu aşıyor.`};
    cleaned[key]=value.trim();continue;
  }
  cleaned[key]=module==="Denetim Yönetimi"&&["requirementStatement","requirementGuidance","requirementAssessment"].includes(key)&&typeof value==="string"?value.slice(0,100000):cleanText(value)}
 const data=normalizeRecordData(module,cleaned);
 if(module==="BIA"){
  for(const key of ["rto","rpo","mtpd"]){
   if(data[key]!=null && data[key]!=="" && !hasRecoveryTarget(data[key]))return {error:key.toUpperCase()+" için geçerli bir saat değeri girin."};
  }
  if(exceedsMtpd(data))return {error:mtpdWarning.tr};
  if(sameBiaPerson(data))return {error:sodWarning.tr};
  for(const role of ["owner","approver"]){
   const email=data[role+"Email"];
   if((email || data[role+"Source"]==="directory" && data[role]) && (!data[role] || typeof email!=="string" || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return {error:"Geçersiz BIA dizin kullanıcısı."};
  }
  for(const key of ["technologyRefs","supplierRefs"]){
   const refs=data[key];if(refs===undefined)continue;
   if(!Array.isArray(refs)||refs.some(ref=>typeof ref!=="string"||!ref.trim()||ref.length>120))return {error:"Geçersiz BIA bağımlılığı."};
   data[key]=[...new Set(refs.map(ref=>ref.trim()))];
  }
 }
 if(module==="Tedarikçiler" && data.vendorEvidenceRefs!==undefined){
  if(!validVendorEvidenceRefs(data.vendorEvidenceRefs))return {error:"Geçersiz tedarikçi kanıt bağlantısı."};
  data.vendorEvidenceRefs=[...new Set(data.vendorEvidenceRefs.map(ref=>ref.trim()))];
 }
 const independentRisk=module==="Risk Assessment" && data.riskScope==="organization";
 if(independentRisk && String(data.asset??"").trim())return {error:"Varlıktan bağımsız bir riskte varlık seçilemez."};
 if(module==="Varlık Envanteri" && data.dependencyRefs!==undefined && (!Array.isArray(data.dependencyRefs) || data.dependencyRefs.some(ref=>typeof ref!=="string" || !ref.trim() || ref.length>120)))return {error:"Geçersiz varlık veya BIA bağlantısı."};
 const missing=required[module].filter(key=>!(independentRisk && key==="asset")).filter(key=>data[key]===undefined||data[key]===null||data[key]==="");
 if(missing.length)return {error:`Zorunlu alanlar eksik: ${missing.join(", ")}`};
 const exitStatus=(v:unknown)=>["offboarding","offboarded","sonlandırıldı","çıkış sürecinde","çıkış / sonlandırıldı"].includes(String(v??"").trim().toLocaleLowerCase("tr"));
 const lockedExit=module==="Tedarikçiler"&&(exitStatus(data.status)||exitStatus(previousStatus));
 if(lockedExit&&data.status!==previousStatus)return {error:"Tedarikçi çıkışı TPRM kontrol listesi ve bağımsız onay gerektirir."};
 if(!lockedExit&&!allowedStatuses[module].includes(String(data.status)))return {error:"Geçersiz operasyon durumu."};
 if(module==="Risk Assessment"&&data.status!=="Değerlendiriliyor"){
  const assessmentMissing=riskAssessmentFields.filter(key=>data[key]===undefined||data[key]===null||data[key]==="");
  if(assessmentMissing.length)return {error:`Risk değerlendirmesi tamamlanmadan bu duruma geçilemez. Eksik alanlar: ${assessmentMissing.join(", ")}`};
 }
 for(const key of ["inherentLikelihood","inherentImpact","confidentialityImpact","integrityImpact","availabilityImpact","confidentialityRating","integrityRating","availabilityRating","financial","operational","legal","reputation","customer","dataImpact"]){
  if(data[key]!==undefined&&data[key]!==""&&(!Number.isInteger(Number(data[key]))||Number(data[key])<1||Number(data[key])>5))return {error:`${key} 1-5 arasında olmalıdır.`};
 }
 if(module==="Risk Assessment" && !isResidualRiskGoverned(data)){
  for(const key of ["residualLikelihood","residualImpact"]){
   const value=data[key];
   if(value!==undefined && value!==null && value!=="" && ((typeof value!=="number" && typeof value!=="string") || !/^[1-5]$/.test(String(value))))return {error:`${key} 1-5 arasında olmalıdır.`};
  }
  const score=assessedResidualRiskScore(data);
  if(score===null){delete data.residualScore;delete data.residualRiskLevel;}
  else {data.residualScore=String(score);data.residualRiskLevel=assuranceRiskLevel(score);}
 }
 if(module==="Risk Assessment" && data.actionOwnerEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.actionOwnerEmail)) || String(data.actionOwnerEmail).length>254))return {error:"Geçersiz aksiyon sahibi e-posta adresi."};
 if(module==="Denetim Yönetimi"&&(!Number.isInteger(Number(data.progress))||Number(data.progress)<0||Number(data.progress)>100))return {error:"progress 0-100 arasında olmalıdır."};
 if(data.ownerEmail&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.ownerEmail))||String(data.ownerEmail).length>254))return {error:"Geçersiz risk sahibi e-posta adresi."};
 for(const key of ["targetDate","lastReview","nextReview","contractEnd","eolDate","lastTestDate","nextTestDate","startDate","endDate","dueDate","approvalDate","acquisitionDate","lastAssessment","nextAssessment","collectedAt","expiresAt"])if(data[key]&&!validDate(data[key]))return {error:`Geçersiz tarih: ${key}`};
 if(data.lastReview&&data.nextReview&&String(data.nextReview)<String(data.lastReview))return {error:"Sonraki değerlendirme tarihi son değerlendirmeden önce olamaz."};
 if(data.startDate&&data.endDate&&String(data.endDate)<String(data.startDate))return {error:"Denetim bitiş tarihi başlangıç tarihinden önce olamaz."};
 const encoded=JSON.stringify(data);if(encoded.length>100_000)return {error:"Kayıt verisi izin verilen boyutu aşıyor."};
 return {module,data};
}
