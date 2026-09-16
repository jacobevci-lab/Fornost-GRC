export const POLICY_CATEGORIES=["security","privacy","risk","compliance","technology","people","operations"] as const;
export const POLICY_CLASSIFICATIONS=["public","internal","confidential","restricted"] as const;

const clean=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const email=(value:unknown,label:string)=>{const result=clean(value,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error(`${label} için geçerli e-posta zorunludur.`);return result};
const date=(value:unknown,label:string)=>{const result=clean(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(`${result}T00:00:00Z`).toISOString().slice(0,10)!==result)throw new Error(`${label} için geçerli tarih zorunludur.`);return result};
const list=(value:unknown,max=50)=>[...new Set((Array.isArray(value)?value:String(value??"").split(/[,\n]/)).map(x=>clean(x,160)).filter(Boolean))].slice(0,max);

export function validatePolicy(input:Record<string,unknown>){
 const code=clean(input.code,40).toUpperCase(),title=clean(input.title,240),category=clean(input.category,40),classification=clean(input.classification,30),owner=email(input.owner,"Politika sahibi"),reviewer=email(input.reviewer,"Reviewer"),audience=clean(input.audience,500),reviewFrequencyDays=Number(input.reviewFrequencyDays);
 if(!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(code)||title.length<5||audience.length<3)throw new Error("Geçerli politika kodu, başlığı ve hedef kitle zorunludur.");
 if(!POLICY_CATEGORIES.includes(category as typeof POLICY_CATEGORIES[number])||!POLICY_CLASSIFICATIONS.includes(classification as typeof POLICY_CLASSIFICATIONS[number]))throw new Error("Politika kategorisi veya sınıfı geçersiz.");
 if(owner===reviewer)throw new Error("Politika sahibi ve bağımsız reviewer farklı olmalıdır.");
 if(!Number.isInteger(reviewFrequencyDays)||reviewFrequencyDays<30||reviewFrequencyDays>1095)throw new Error("İnceleme sıklığı 30-1095 gün arasında olmalıdır.");
 return{code,title,category,classification,owner,reviewer,audience,reviewFrequencyDays};
}

export function validatePolicyVersion(input:Record<string,unknown>){
 const policyId=clean(input.policyId,100),summary=clean(input.summary,1000),content=clean(input.content,50_000),effectiveDate=date(input.effectiveDate,"Yürürlük tarihi"),controlRefs=list(input.controlRefs),regulationRefs=list(input.regulationRefs),riskRefs=list(input.riskRefs);
 if(!policyId||summary.length<10||content.length<80)throw new Error("Politika, değişiklik özeti ve en az 80 karakter içerik zorunludur.");
 if(controlRefs.length+regulationRefs.length+riskRefs.length===0)throw new Error("En az bir kontrol, regülasyon veya risk eşlemesi zorunludur.");
 return{policyId,summary,content,effectiveDate,controlRefs,regulationRefs,riskRefs};
}

export function validatePolicyAction(input:Record<string,unknown>){
 const operation=clean(input.operation,40),note=clean(input.note,1600),confirmation=clean(input.confirmation,100),evidenceReference=clean(input.evidenceReference,500),evidenceSha256=clean(input.evidenceSha256,64).toLowerCase();
 const phrases:Record<string,string>={submit:"İNCELEMEYE GÖNDER",approve:"POLİTİKAYI ONAYLA",reject:"POLİTİKAYI REDDET",publish:"POLİTİKAYI YAYINLA",retire:"POLİTİKAYI YÜRÜRLÜKTEN KALDIR","submit-exception":"İSTİSNAYI GÖNDER","approve-exception":"İSTİSNAYI ONAYLA","reject-exception":"İSTİSNAYI REDDET","close-exception":"İSTİSNAYI KAPAT"};
 if(!phrases[operation]||confirmation!==phrases[operation]||note.length<5)throw new Error(`${phrases[operation]||"Geçerli işlem"} onayı ve açıklama zorunludur.`);
 if(["submit","approve","publish","retire","approve-exception","close-exception"].includes(operation)&&(!evidenceReference||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw new Error("Kanıt referansı ve 64 karakter SHA-256 zorunludur.");
 return{operation,note,evidenceReference,evidenceSha256};
}

export function validateCampaign(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const policyId=clean(input.policyId,100),versionId=clean(input.versionId,100),name=clean(input.name,200),audience=clean(input.audience,500),dueDate=date(input.dueDate,"Son tarih"),subjects=list(input.subjects,500).map(x=>email(x,"Katılımcı"));
 if(!policyId||!versionId||name.length<5||audience.length<3||!subjects.length)throw new Error("Yayındaki sürüm, kampanya, hedef kitle ve katılımcılar zorunludur.");
 if(dueDate<today)throw new Error("Kampanya son tarihi geçmişte olamaz.");
 return{policyId,versionId,name,audience,dueDate,subjects};
}

export function validateException(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const policyId=clean(input.policyId,100),versionId=clean(input.versionId,100),scope=clean(input.scope,800),rationale=clean(input.rationale,2000),compensatingControl=clean(input.compensatingControl,2000),owner=email(input.owner,"İstisna sahibi"),reviewer=email(input.reviewer,"Reviewer"),expiresAt=date(input.expiresAt,"İstisna bitişi");
 const days=Math.ceil((new Date(`${expiresAt}T00:00:00Z`).getTime()-new Date(`${today}T00:00:00Z`).getTime())/86_400_000);
 if(!policyId||!versionId||scope.length<5||rationale.length<10||compensatingControl.length<10)throw new Error("Yayındaki politika, kapsam, gerekçe ve telafi kontrolü zorunludur.");
 if(owner===reviewer)throw new Error("İstisna sahibi ve bağımsız reviewer farklı olmalıdır.");
 if(days<1||days>180)throw new Error("İstisna süresi 1-180 gün arasında olmalıdır.");
 return{policyId,versionId,scope,rationale,compensatingControl,owner,reviewer,expiresAt};
}

export function policyAttention(status:string,nextReview:string,activeExceptions:number,pendingAttestations:number,now=new Date()){
 if(status==="retired")return status;const today=now.toISOString().slice(0,10);
 if(nextReview&&nextReview<today)return"review-overdue";
 if(nextReview&&Math.ceil((new Date(`${nextReview}T23:59:59Z`).getTime()-now.getTime())/86_400_000)<=30)return"review-due";
 if(activeExceptions>0)return"active-exception";
 if(pendingAttestations>0)return"attestation-pending";
 return status;
}

export function nextReviewDate(effectiveDate:string,frequencyDays:number){const value=new Date(`${effectiveDate}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+frequencyDays);return value.toISOString().slice(0,10)}
