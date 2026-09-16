export const REGULATORY_SEVERITIES=["low","medium","high","critical"] as const;
export const REGULATORY_CHANGE_TYPES=["new-regulation","amendment","guidance","enforcement","deadline","consultation"] as const;
export const REGULATORY_TARGET_TYPES=["control","policy","risk","asset","vendor","process","audit","evidence"] as const;
export type RegulatorySeverity=typeof REGULATORY_SEVERITIES[number];

const text=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const date=(value:unknown)=>{const result=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(`${result}T00:00:00Z`).toISOString().slice(0,10)!==result)throw new Error("Geçerli tarih zorunludur.");return result};
const email=(value:unknown)=>{const result=text(value,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error("Geçerli sorumlu e-postası zorunludur.");return result};

export function validateRegulatorySource(input:Record<string,unknown>){
 const name=text(input.name,180),authority=text(input.authority,180),jurisdiction=text(input.jurisdiction,100),sourceType=text(input.sourceType,40),owner=email(input.owner),frequency=Number(input.reviewFrequencyDays||30);
 if(name.length<3||authority.length<2||jurisdiction.length<2)throw new Error("Kaynak, otorite ve yetki alanı zorunludur.");
 if(!["regulator","legislation","standard","industry","internal"].includes(sourceType))throw new Error("Geçersiz kaynak türü.");
 if(!Number.isInteger(frequency)||frequency<1||frequency>365)throw new Error("Gözden geçirme sıklığı 1-365 gün olmalıdır.");
 return{name,authority,jurisdiction,sourceType,owner,reviewFrequencyDays:frequency,url:text(input.url,2048)};
}

export function validateRegulatoryChange(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const sourceId=text(input.sourceId,100),externalRef=text(input.externalRef,180),title=text(input.title,240),summary=text(input.summary,4000),publishedDate=date(input.publishedDate),effectiveDate=date(input.effectiveDate),severity=text(input.severity,20) as RegulatorySeverity,changeType=text(input.changeType,40),owner=email(input.owner),reviewer=email(input.reviewer);
 if(!sourceId||!externalRef||title.length<5||summary.length<20)throw new Error("Kaynak, referans, başlık ve açıklayıcı özet zorunludur.");
 if(!REGULATORY_SEVERITIES.includes(severity)||!REGULATORY_CHANGE_TYPES.includes(changeType as typeof REGULATORY_CHANGE_TYPES[number]))throw new Error("Önem veya değişiklik türü geçersiz.");
 if(effectiveDate<publishedDate)throw new Error("Yürürlük tarihi yayımlanma tarihinden önce olamaz.");
 if(owner===reviewer)throw new Error("Değişiklik sahibi ve bağımsız doğrulayıcı farklı olmalıdır.");
 return{sourceId,externalRef,title,summary,publishedDate,effectiveDate,severity,changeType,owner,reviewer,lateIntake:effectiveDate<today};
}

export function validateRegulatoryImpact(input:Record<string,unknown>,effectiveDate:string,today=new Date().toISOString().slice(0,10)){
 const changeId=text(input.changeId,100),targetType=text(input.targetType,30),targetRef=text(input.targetRef,120),targetTitle=text(input.targetTitle,240),impactLevel=text(input.impactLevel,20),requiredAction=text(input.requiredAction,2000),actionOwner=email(input.actionOwner),dueDate=date(input.dueDate);
 if(!changeId||!REGULATORY_TARGET_TYPES.includes(targetType as typeof REGULATORY_TARGET_TYPES[number])||!targetRef||!targetTitle)throw new Error("Etki hedefi ve bağlı kayıt zorunludur.");
 if(!["low","medium","high","critical"].includes(impactLevel)||requiredAction.length<10)throw new Error("Etki seviyesi ve düzeltici aksiyon zorunludur.");
 if(dueDate<today)throw new Error("Aksiyon tarihi geçmişte olamaz.");
 if(effectiveDate>=today&&dueDate>effectiveDate)throw new Error("Aksiyon tarihi yürürlük tarihini aşamaz.");
 return{changeId,targetType,targetRef,targetTitle,impactLevel,requiredAction,actionOwner,dueDate};
}

export function regulatoryAttention(status:string,severity:string,effectiveDate:string,openImpacts:number,now=new Date()){
 if(status==="closed"||status==="not-applicable")return status;
 if(effectiveDate<now.toISOString().slice(0,10))return "overdue";
 const days=Math.ceil((new Date(`${effectiveDate}T23:59:59Z`).getTime()-now.getTime())/86_400_000);
 if(severity==="critical"&&openImpacts>0)return "critical";
 if(days<=7)return "due-7";
 if(days<=30)return "due-30";
 return status;
}

export function nextSourceReview(reviewFrequencyDays:number,from=new Date()){
 return new Date(from.getTime()+reviewFrequencyDays*86_400_000).toISOString();
}

export function validateImpactAction(input:Record<string,unknown>){
 const action=text(input.action,30),note=text(input.note,1200),evidenceReference=text(input.evidenceReference,500),evidenceSha256=text(input.evidenceSha256,64).toLowerCase(),confirmation=text(input.confirmation,80);
 if(!["start","submit","verify","reopen"].includes(action)||note.length<5)throw new Error("Geçerli işlem ve açıklama zorunludur.");
 const phrase=action==="start"?"AKSİYONU BAŞLAT":action==="submit"?"DOĞRULAMAYA GÖNDER":action==="verify"?"ETKİYİ DOĞRULA":"ETKİYİ YENİDEN AÇ";
 if(confirmation!==phrase)throw new Error(`${phrase} onayı zorunludur.`);
 if(["submit","verify"].includes(action)&&(!evidenceReference||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw new Error("Kanıt referansı ve 64 karakter SHA-256 zorunludur.");
 return{action,note,evidenceReference,evidenceSha256};
}
