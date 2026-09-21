export type RiskReviewProposal={riskId:string;residualLikelihood:number;residualImpact:number;rationale:string;evidenceReference:string;evidenceSha256:string};
export type AssuranceExceptionProposal={findingId:string;ruleId:string;controlRef:string;riskRef:string;reason:string;expiresAt:string;evidenceReference:string;evidenceSha256:string};

const text=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const digest=(value:unknown)=>/^[a-f0-9]{64}$/i.test(text(value,64));
const day=(value:unknown)=>{const result=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result))return "";const parsed=new Date(`${result}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===result?result:""};
export const assuranceRiskLevel=(score:number)=>score>=16?"Kritik":score>=10?"Yüksek":score>=5?"Orta":"Düşük";
export const addUtcDays=(value:string,days:number)=>{const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};

export function validateRiskReviewProposal(input:Record<string,unknown>):RiskReviewProposal{
 const riskId=text(input.riskId,120),residualLikelihood=Number(input.residualLikelihood),residualImpact=Number(input.residualImpact),rationale=text(input.rationale,2400),evidenceReference=text(input.evidenceReference,500),evidenceSha256=text(input.evidenceSha256,64).toLowerCase();
 if(!riskId)throw new Error("Risk referansı zorunludur.");
 if(!Number.isInteger(residualLikelihood)||residualLikelihood<1||residualLikelihood>5||!Number.isInteger(residualImpact)||residualImpact<1||residualImpact>5)throw new Error("Residual likelihood ve impact 1-5 arasında olmalıdır.");
 if(rationale.length<20)throw new Error("Risk yeniden değerlendirme gerekçesi en az 20 karakter olmalıdır.");
 if(!evidenceReference||!digest(evidenceSha256))throw new Error("Kanıt referansı ve 64 karakter SHA-256 zorunludur.");
 return{riskId,residualLikelihood,residualImpact,rationale,evidenceReference,evidenceSha256};
}

export function validateAssuranceException(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)):AssuranceExceptionProposal{
 const findingId=text(input.findingId,120),ruleId=text(input.ruleId,120),controlRef=text(input.controlRef,240),riskRef=text(input.riskRef,120),reason=text(input.reason,2400),expiresAt=day(input.expiresAt),evidenceReference=text(input.evidenceReference,500),evidenceSha256=text(input.evidenceSha256,64).toLowerCase();
 if(!findingId&&!ruleId&&!controlRef&&!riskRef)throw new Error("Exception en az bir finding, rule, control veya risk referansına bağlanmalıdır.");
 if(reason.length<20)throw new Error("Exception gerekçesi en az 20 karakter olmalıdır.");
 if(!expiresAt)throw new Error("Geçerli exception bitiş tarihi zorunludur.");
 if(expiresAt<today||expiresAt>addUtcDays(today,180))throw new Error("Exception bugün ile en fazla 180 gün sonrası arasında olmalıdır.");
 if(!evidenceReference||!digest(evidenceSha256))throw new Error("Exception için kanıt referansı ve SHA-256 zorunludur.");
 return{findingId,ruleId,controlRef,riskRef,reason,expiresAt,evidenceReference,evidenceSha256};
}

export function exceptionEffectiveStatus(status:string,expiresAt:string,today=new Date().toISOString().slice(0,10)){
 if(status==="active"&&expiresAt<today)return "expired" as const;
 return status;
}

export function applyApprovedResidualRisk(data:Record<string,unknown>,proposal:RiskReviewProposal,actor:string,at:string){
 const residualScore=proposal.residualLikelihood*proposal.residualImpact;
 return{...data,residualLikelihood:String(proposal.residualLikelihood),residualImpact:String(proposal.residualImpact),residualScore:String(residualScore),residualRiskLevel:assuranceRiskLevel(residualScore),residualRiskReviewRequired:false,residualRiskApprovedBy:actor,residualRiskApprovedAt:at,residualRiskRationale:proposal.rationale,residualRiskEvidenceReference:proposal.evidenceReference,residualRiskEvidenceSha256:proposal.evidenceSha256,lastReassessedAt:at,reassessmentSource:"Continuous Assurance · Risk Owner Review"};
}
