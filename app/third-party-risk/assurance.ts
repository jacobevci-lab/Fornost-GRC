import {validReviewDate} from "./review-schedule";
import {assessmentMetrics,TPRM_CONTROLS} from "./domain";
import {hasRecoveryTarget} from "../bia-recovery";

export const documentTypes = {
  iso: ["ISO/IEC 27001 Sertifikası","ISO/IEC 27001 certificate"],
  soc: ["SOC 2 Type II / ISAE 3402 Raporu","SOC 2 Type II / ISAE 3402 report"],
  dpa: ["İmzalı DPA / KVKK Veri İşleyen Sözleşmesi","Signed DPA / KVKK data processing agreement"],
  pentest: ["Sızma Testi / Zafiyet Özeti","Penetration test / vulnerability summary"],
  bcdr: ["BC/DR Tatbikat Raporu","BC/DR exercise report"],
} as const;
export type DocumentKind = keyof typeof documentTypes;
export const documentKinds = Object.keys(documentTypes) as DocumentKind[];
export type AssuranceDocument = {kind:DocumentKind; revision:string; evidenceId:string; versionId:string; versionNo:number; code:string|null; title:string; sha256:string; expires:string; available:number};
export type AssuranceVendor = {vendorId:string; name:string; status:string; criticality:string; contractEnd?:string; documents?:AssuranceDocument[]; supportIds?:string[]; businessOwner?:string; riskOwner?:string; reviewer?:string; reviewerAdmin?:boolean};
export const utcDay=()=>new Date().toISOString().slice(0,10);
export function daysLeft(date:unknown,today=utcDay()){
  return validReviewDate(date)?(Date.parse(date)-Date.parse(today))/86400000:null;
}
export function validity(doc?:AssuranceDocument,today=utcDay()){
  const days=daysLeft(doc?.expires,today);
  if(!doc?.available||days===null)return "missing";
  return days<0?"expired":days<=30?"soon":"valid";
}
export function criticalSupplier(criticality:string){return /^(critical|kritik|tier[ -]?1)$/i.test(criticality);}
export function renewalNeeded(v:AssuranceVendor,today=utcDay()){
  if(!criticalSupplier(v.criticality)||["offboarded","excluded","rejected","cancelled"].includes(v.status))return false;
  const valid=(kind:DocumentKind)=>["valid","soon"].includes(validity(v.documents?.find(d=>d.kind===kind),today));
  return !valid("dpa")||!(valid("iso")||valid("soc"));
}
export type Scoring = {impact:unknown;likelihood:unknown;controlMaturity:unknown;questionnaire:Record<string,unknown>;inherentScore:unknown;residualScore:unknown};
export function scored(a:Scoring){
  const dimensions=[a.impact,a.likelihood,a.controlMaturity];
  if(!dimensions.every(x=>Number.isInteger(x)&&Number(x)>=1&&Number(x)<=5)||!a.questionnaire||!TPRM_CONTROLS.every(k=>typeof a.questionnaire[k]==="boolean"))return false;
  const scores=assessmentMetrics(Number(a.impact),Number(a.likelihood),Number(a.controlMaturity),a.questionnaire);
  return a.inherentScore===scores.inherentScore&&a.residualScore===scores.residualScore;
}
export function usableSupport(v:AssuranceVendor,today=utcDay()){
  const docs=v.documents||[];
  return [...new Set([...docs.filter(d=>["valid","soon"].includes(validity(d,today))).map(d=>d.evidenceId),
    ...(v.supportIds||[]).filter(id=>!docs.some(d=>d.evidenceId===id))])];
}
export function decisionChecks(v:AssuranceVendor,a:Scoring,reason:string,decisionEvidence?:string,today=utcDay()){
  const reviewer=v.reviewer?.trim().toLowerCase();
  return {owners:Boolean(v.businessOwner?.trim()&&v.riskOwner?.trim()),
    reviewer:Boolean(v.reviewerAdmin&&reviewer&&![v.businessOwner,v.riskOwner].some(x=>x?.trim().toLowerCase()===reviewer)),
    score:scored(a),support:Boolean(usableSupport(v,today).length||reason.trim()||(decisionEvidence&&(!(v.documents||[]).some(d=>d.evidenceId===decisionEvidence)||usableSupport(v,today).includes(decisionEvidence))))};
}
export function recoverySummary(processes:{data:Record<string,unknown>}[]){
  const min=(key:string)=>{const hours=processes.map(p=>p.data[key]).filter(hasRecoveryTarget).map(Number);return hours.length?Math.min(...hours):null;};
  const classified=processes.map(p=>String(p.data.criticality||"").trim()).filter(Boolean);
  return {rto:min("rto"),rpo:min("rpo"),critical:classified.length===processes.length?classified.filter(criticalSupplier).length:null};
}
