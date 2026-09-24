export const FINDING_SEVERITIES=["low","medium","high","critical"] as const;
export const FINDING_SOURCES=["audit","control","continuous-control","vendor","regulatory","risk","policy","incident","vulnerability","ai","manual"] as const;
export const FINDING_TYPES=["nonconformity","control-deficiency","observation","vulnerability","incident-action","improvement"] as const;
const clean=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const email=(value:unknown,label:string)=>{const result=clean(value,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error(`${label} için geçerli e-posta zorunludur.`);return result};
const date=(value:unknown,label:string)=>{const result=clean(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(`${result}T00:00:00Z`).toISOString().slice(0,10)!==result)throw new Error(`${label} için geçerli tarih zorunludur.`);return result};
const sha=(value:unknown)=>{const result=clean(value,64).toLowerCase();if(!/^[a-f0-9]{64}$/.test(result))throw new Error("64 karakter SHA-256 kanıt özeti zorunludur.");return result};

export function findingSlaDays(severity:string){return({critical:7,high:30,medium:60,low:90} as Record<string,number>)[severity]||0}
export function addDays(day:string,days:number){const value=new Date(`${day}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}

export function validateFinding(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const sourceType=clean(input.sourceType,30),sourceRef=clean(input.sourceRef,120),sourceTitle=clean(input.sourceTitle,240),findingType=clean(input.findingType,40),title=clean(input.title,240),description=clean(input.description,3000),severity=clean(input.severity,20),owner=email(input.owner,"Aksiyon sahibi"),reviewer=email(input.reviewer,"Bağımsız reviewer"),rootCause=clean(input.rootCause,2400),correctiveAction=clean(input.correctiveAction,2400),preventiveAction=clean(input.preventiveAction,2400),dueDate=date(input.dueDate,"Termin"),riskRef=clean(input.riskRef,120),controlRef=clean(input.controlRef,120);
 if(!FINDING_SOURCES.includes(sourceType as typeof FINDING_SOURCES[number])||!FINDING_TYPES.includes(findingType as typeof FINDING_TYPES[number])||!FINDING_SEVERITIES.includes(severity as typeof FINDING_SEVERITIES[number]))throw new Error("Kaynak, bulgu türü veya önem seviyesi geçersiz.");
 if(sourceRef.length<2||sourceTitle.length<3||title.length<5||description.length<20||rootCause.length<10||correctiveAction.length<20||preventiveAction.length<20)throw new Error("Kaynak, açıklama, kök neden ve CAPA planı eksiksiz girilmelidir.");
 if(owner===reviewer)throw new Error("Aksiyon sahibi ve bağımsız reviewer farklı olmalıdır.");
 const maximum=addDays(today,findingSlaDays(severity));if(dueDate<today||dueDate>maximum)throw new Error(`${severity} bulgu termini en fazla ${findingSlaDays(severity)} gün içinde olmalıdır.`);
 return{sourceType,sourceRef,sourceTitle,findingType,title,description,severity,owner,reviewer,rootCause,correctiveAction,preventiveAction,dueDate,riskRef,controlRef};
}

export function validateFindingAction(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const operation=clean(input.operation,30),note=clean(input.note,2000),confirmation=clean(input.confirmation,100),evidenceReference=clean(input.evidenceReference,500),evidenceSha256=clean(input.evidenceSha256,64),acceptUntil=clean(input.acceptUntil,10),acceptanceRationale=clean(input.acceptanceRationale,2000);
 const phrases:Record<string,string>={start:"CAPA AKSİYONUNU BAŞLAT",submit:"CAPA DOĞRULAMAYA GÖNDER",verify:"BULGUYU KAPAT",reopen:"BULGUYU YENİDEN AÇ","accept-risk":"BULGU RİSKİNİ KABUL ET"};
 if(!phrases[operation]||confirmation!==phrases[operation]||note.length<5)throw new Error(`${phrases[operation]||"Geçerli işlem"} onayı ve açıklama zorunludur.`);
 if(["submit","verify","accept-risk"].includes(operation)&&(!evidenceReference||!evidenceSha256))throw new Error("Kanıt referansı ve SHA-256 zorunludur.");
 const digest=["submit","verify","accept-risk"].includes(operation)?sha(evidenceSha256):"";
 if(operation==="accept-risk"){const until=date(acceptUntil,"Risk kabul bitişi"),maximum=addDays(today,180);if(until<today||until>maximum||acceptanceRationale.length<20)throw new Error("Risk kabulü gerekçeli ve en fazla 180 gün süreli olmalıdır.");return{operation,note,evidenceReference,evidenceSha256:digest,acceptUntil:until,acceptanceRationale}}
 return{operation,note,evidenceReference,evidenceSha256:digest,acceptUntil:"",acceptanceRationale:""};
}

export function findingAttention(status:string,severity:string,dueDate:string,acceptUntil="",now=new Date()){
 const today=now.toISOString().slice(0,10);if(status==="closed")return"closed";if(status==="accepted")return acceptUntil&&acceptUntil<today?"acceptance-expired":"accepted";if(dueDate<today)return"overdue";const days=Math.ceil((new Date(`${dueDate}T23:59:59Z`).getTime()-now.getTime())/86_400_000);if(severity==="critical"||severity==="high"||days<=7)return"priority";return status;
}