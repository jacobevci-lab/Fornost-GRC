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
 "Varlık Envanteri":["Aktif","Bakımda","Devre Dışı","Arşivlendi"],
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
 if(module==="BIA"){if(!data.processCategory)data.processCategory="Operasyonel Süreç";if(!data.status)data.status="Aktif"}
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
export function validate(module:unknown,input:unknown){
 if(!validModule(module))return {error:"Geçersiz modül."};
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Geçersiz kayıt verisi."};
 const source=input as Data,cleaned:Data={};
 for(const [key,value] of Object.entries(source)){if(key.length>60)continue;cleaned[key]=module==="Denetim Yönetimi"&&["requirementStatement","requirementGuidance","requirementAssessment"].includes(key)&&typeof value==="string"?value.slice(0,100000):cleanText(value)}
 const data=normalizeRecordData(module,cleaned);
 const missing=required[module].filter(key=>data[key]===undefined||data[key]===null||data[key]==="");
 if(missing.length)return {error:`Zorunlu alanlar eksik: ${missing.join(", ")}`};
 if(!allowedStatuses[module].includes(String(data.status)))return {error:"Geçersiz operasyon durumu."};
 if(module==="Risk Assessment"&&data.status!=="Değerlendiriliyor"){
  const assessmentMissing=riskAssessmentFields.filter(key=>data[key]===undefined||data[key]===null||data[key]==="");
  if(assessmentMissing.length)return {error:`Risk değerlendirmesi tamamlanmadan bu duruma geçilemez. Eksik alanlar: ${assessmentMissing.join(", ")}`};
 }
 for(const key of ["inherentLikelihood","inherentImpact","confidentialityImpact","integrityImpact","availabilityImpact","confidentialityRating","integrityRating","availabilityRating","financial","operational","legal","reputation","customer","dataImpact"]){
  if(data[key]!==undefined&&data[key]!==""&&(!Number.isInteger(Number(data[key]))||Number(data[key])<1||Number(data[key])>5))return {error:`${key} 1-5 arasında olmalıdır.`};
 }
 if(module==="Denetim Yönetimi"&&(!Number.isInteger(Number(data.progress))||Number(data.progress)<0||Number(data.progress)>100))return {error:"progress 0-100 arasında olmalıdır."};
 if(data.ownerEmail&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.ownerEmail))||String(data.ownerEmail).length>254))return {error:"Geçersiz risk sahibi e-posta adresi."};
 for(const key of ["targetDate","lastReview","nextReview","contractEnd","eolDate","lastTestDate","nextTestDate","startDate","endDate","dueDate","approvalDate","acquisitionDate","lastAssessment","nextAssessment","collectedAt","expiresAt"])if(data[key]&&!validDate(data[key]))return {error:`Geçersiz tarih: ${key}`};
 if(data.lastReview&&data.nextReview&&String(data.nextReview)<String(data.lastReview))return {error:"Sonraki değerlendirme tarihi son değerlendirmeden önce olamaz."};
 if(data.startDate&&data.endDate&&String(data.endDate)<String(data.startDate))return {error:"Denetim bitiş tarihi başlangıç tarihinden önce olamaz."};
 const encoded=JSON.stringify(data);if(encoded.length>100_000)return {error:"Kayıt verisi izin verilen boyutu aşıyor."};
 return {module,data};
}
