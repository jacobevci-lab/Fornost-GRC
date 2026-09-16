export const TPRM_CRITICALITIES=["low","medium","high","critical"] as const;
export const TPRM_DATA_CLASSES=["public","internal","confidential","restricted"] as const;
export const TPRM_CONTROLS=["securityProgram","accessControl","encryption","logging","vulnerabilityManagement","incidentNotification","bcdr","subprocessorGovernance","dataDeletion","auditRights","dataPortability","dpa"] as const;
export type TprmControl=typeof TPRM_CONTROLS[number];

const clean=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const email=(value:unknown)=>{const result=clean(value,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error("Geçerli sorumlu e-postası zorunludur.");return result};
const date=(value:unknown)=>{const result=clean(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(`${result}T00:00:00Z`).toISOString().slice(0,10)!==result)throw new Error("Geçerli tarih zorunludur.");return result};
const score=(value:unknown,label:string)=>{const result=Number(value);if(!Number.isInteger(result)||result<1||result>5)throw new Error(`${label} 1-5 arasında olmalıdır.`);return result};

export function validateThirdParty(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const name=clean(input.name,200),service=clean(input.service,240),legalEntity=clean(input.legalEntity,200),category=clean(input.category,80),criticality=clean(input.criticality,20),dataClassification=clean(input.dataClassification,30),dataAccess=clean(input.dataAccess,800),hostingLocation=clean(input.hostingLocation,160),businessOwner=email(input.businessOwner),riskOwner=email(input.riskOwner),reviewer=email(input.reviewer),contact=email(input.contact),contractEnd=date(input.contractEnd),nextReview=date(input.nextReview),exitPlan=clean(input.exitPlan,1600);
 if(name.length<2||service.length<3||legalEntity.length<2||category.length<2)throw new Error("Tedarikçi, hizmet, tüzel kişilik ve kategori zorunludur.");
 if(!TPRM_CRITICALITIES.includes(criticality as typeof TPRM_CRITICALITIES[number])||!TPRM_DATA_CLASSES.includes(dataClassification as typeof TPRM_DATA_CLASSES[number]))throw new Error("Kritiklik veya veri sınıfı geçersiz.");
 if(dataAccess.length<3||hostingLocation.length<2||exitPlan.length<10)throw new Error("Veri erişimi, lokasyon ve uygulanabilir çıkış planı zorunludur.");
 if(new Set([businessOwner,riskOwner,reviewer]).size<3)throw new Error("İş sahibi, risk sahibi ve bağımsız reviewer farklı olmalıdır.");
 if(contractEnd<today||nextReview<today||nextReview>contractEnd)throw new Error("İnceleme tarihi bugün ile sözleşme bitişi arasında olmalıdır.");
 return{name,service,legalEntity,category,criticality,dataClassification,dataAccess,hostingLocation,businessOwner,riskOwner,reviewer,contact,contractEnd,nextReview,exitPlan};
}

export function validateAssessment(input:Record<string,unknown>){
 const vendorId=clean(input.vendorId,100),impact=score(input.impact,"Etki"),likelihood=score(input.likelihood,"Olasılık"),controlMaturity=score(input.controlMaturity,"Kontrol olgunluğu"),treatmentPlan=clean(input.treatmentPlan,2000),questionnaire=Object.fromEntries(TPRM_CONTROLS.map(key=>[key,input[key]===true||input[key]==="true"]));
 if(!vendorId||treatmentPlan.length<10)throw new Error("Tedarikçi ve risk iyileştirme planı zorunludur.");
 const passed=TPRM_CONTROLS.filter(key=>questionnaire[key]).length,coverage=Math.round(passed/TPRM_CONTROLS.length*100),inherentScore=impact*likelihood,residualScore=Math.max(1,Math.round(inherentScore*(1-coverage/100*0.6)*(1-(controlMaturity-1)*0.08))),riskTier=residualScore>=18?"critical":residualScore>=11?"high":residualScore>=6?"medium":"low";
 const criticalGaps=TPRM_CONTROLS.filter(key=>["incidentNotification","dataDeletion","auditRights","dpa"].includes(key)&&!questionnaire[key]);
 return{vendorId,impact,likelihood,controlMaturity,treatmentPlan,questionnaire,coverage,inherentScore,residualScore,riskTier,criticalGaps};
}

export function validateFinding(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const assessmentId=clean(input.assessmentId,100),title=clean(input.title,240),severity=clean(input.severity,20),description=clean(input.description,1600),owner=email(input.owner),dueDate=date(input.dueDate);
 if(!assessmentId||title.length<5||description.length<10||!TPRM_CRITICALITIES.includes(severity as typeof TPRM_CRITICALITIES[number]))throw new Error("Değerlendirme, başlık, önem ve açıklama zorunludur.");
 if(dueDate<today)throw new Error("Bulgu termin tarihi geçmişte olamaz.");
 return{assessmentId,title,severity,description,owner,dueDate};
}

export function validateEvidenceAction(input:Record<string,unknown>){
 const operation=clean(input.operation,30),note=clean(input.note,1200),confirmation=clean(input.confirmation,80),evidenceReference=clean(input.evidenceReference,500),evidenceSha256=clean(input.evidenceSha256,64).toLowerCase();
 const phrases:Record<string,string>={submit:"İNCELEMEYE GÖNDER",approve:"TEDARİKÇİYİ ONAYLA",conditional:"KOŞULLU ONAYLA",reject:"TEDARİKÇİYİ REDDET",start:"BULGUYU BAŞLAT","submit-finding":"BULGUYU DOĞRULAMAYA GÖNDER","verify-finding":"BULGUYU KAPAT","reopen-finding":"BULGUYU YENİDEN AÇ",offboard:"TEDARİKÇİYİ KAPAT"};
 if(!phrases[operation]||confirmation!==phrases[operation]||note.length<5)throw new Error(`${phrases[operation]||"Geçerli işlem"} onayı ve açıklama zorunludur.`);
 if(["submit","approve","conditional","submit-finding","verify-finding","offboard"].includes(operation)&&(!evidenceReference||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw new Error("Kanıt referansı ve 64 karakter SHA-256 zorunludur.");
 return{operation,note,evidenceReference,evidenceSha256};
}

export function thirdPartyAttention(status:string,nextReview:string,contractEnd:string,openCritical:number,now=new Date()){
 if(status==="offboarded"||status==="rejected")return status;
 const today=now.toISOString().slice(0,10);
 if(contractEnd<today)return "contract-expired";
 if(openCritical>0)return "critical-finding";
 const days=Math.ceil((new Date(`${nextReview}T23:59:59Z`).getTime()-now.getTime())/86_400_000);
 if(nextReview<today)return "review-overdue";
 if(days<=30)return "review-due";
 return status;
}
