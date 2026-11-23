import {EVIDENCE_METADATA_FIELDS} from "./file-types";

type Data=Record<string,unknown>;
export const pendingEvidence={status:"İncelemede",reviewStatus:"pending-review"} as const;
const identity=(v:unknown)=>String(v??"").trim().toLowerCase();
export function evidenceReviewerIsIndependent(data:Data,actor?:{email:string;name?:string},creators:unknown[]=[]){
  const reviewer=identity(data.reviewer);
  if(!reviewer || actor && identity(actor.email)!==reviewer)return false;
  const others=[data.owner,data.ownerEmail,data.uploadedBy,data.versionUploadedBy,...creators].map(identity).filter(Boolean);
  return !others.includes(reviewer)&&!(actor?.name&&identity(data.owner)===identity(actor.name));
}
export function evidenceState(data:Data,tr:boolean){
  const labels:Record<string,[string,string]>={"İncelemede":["İnceleme Bekliyor","Pending review"],"Onaylandı":["Onaylandı","Approved"],"Taslak":["Taslak","Draft"],"Reddedildi":["Reddedildi","Rejected"],"Süresi Doldu":["Süresi Doldu","Expired"]};
  return labels[String(data.status)]?.[tr?0:1]||String(data.status||"—");
}
export function localDay(now=new Date()){
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
}
export function validityDate(day:string,period:"30"|"90"|"6m"|"1y"){
  const base=new Date(day+"T00:00:00Z");
  if(!Number.isFinite(base.getTime()))return "";
  if(period==="30"||period==="90")base.setUTCDate(base.getUTCDate()+Number(period));
  else{
    const d=base.getUTCDate();base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+(period==="6m"?6:12));
    const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
    base.setUTCDate(Math.min(d,last));
  }
  return base.toISOString().slice(0,10);
}
export function pendingVersion(data:Data){
  const next={...data,...pendingEvidence};
  for(const key of ["reviewedBy","reviewedAt","reviewedVersion"])delete (next as Data)[key];
  return next;
}
// The generic register may edit descriptive fields. File anchors and review decisions
// belong to the upload/version transaction and the independent review action.
export function editableEvidence(input:Data,before?:Data):Data{
  const next={...before};let changed=!before;
  for(const key of EVIDENCE_METADATA_FIELDS){
    if(input[key]===undefined)continue;
    next[key]=input[key];
    if(String(input[key]??"")!==String(before?.[key]??""))changed=true;
  }
  return changed?pendingVersion(next):next;
}
export function validEvidenceRefs(value:unknown){
  if(typeof value!=="string")return false;
  const refs=value.split(/[;,|\n]/).map(ref=>ref.trim()).filter(Boolean);
  return refs.length>0&&new Set(refs.map(identity)).size<=100&&refs.every(ref=>ref.length<=160)&&value.length<=16500;
}
export function evidenceDatesInvalid(data:Data){
  return Boolean(data.collectedAt&&data.expiresAt&&String(data.expiresAt)<String(data.collectedAt));
}
