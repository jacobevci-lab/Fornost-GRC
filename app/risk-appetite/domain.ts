export const RISK_DIRECTIONS=["upper","lower"] as const;
export const RISK_CATEGORIES=["cyber","technology","operational","third-party","compliance","privacy","financial","strategic","people","resilience"] as const;
const clean=(value:unknown,max:number)=>String(value??"").trim().replace(/\u0000/g,"").slice(0,max);
const email=(value:unknown,label:string)=>{const result=clean(value,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error(`${label} için geçerli e-posta zorunludur.`);return result};
const date=(value:unknown,label:string)=>{const result=clean(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(`${result}T00:00:00Z`).toISOString().slice(0,10)!==result)throw new Error(`${label} için geçerli tarih zorunludur.`);return result};
const number=(value:unknown,label:string,min=-1_000_000_000,max=1_000_000_000)=>{const result=Number(value);if(!Number.isFinite(result)||result<min||result>max)throw new Error(`${label} geçerli sınırlar içinde olmalıdır.`);return result};

export function validateRiskAppetite(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const code=clean(input.code,40).toUpperCase(),category=clean(input.category,30),statement=clean(input.statement,2000),kriName=clean(input.kriName,240),metricUnit=clean(input.metricUnit,40),direction=clean(input.direction,10),appetiteTarget=number(input.appetiteTarget,"Risk iştahı"),warningThreshold=number(input.warningThreshold,"Uyarı eşiği"),breachThreshold=number(input.breachThreshold,"İhlal eşiği"),owner=email(input.owner,"Risk sahibi"),reviewer=email(input.reviewer,"Reviewer"),frequencyDays=number(input.frequencyDays,"Ölçüm sıklığı",1,365),validFrom=date(input.validFrom,"Başlangıç"),validUntil=date(input.validUntil,"Bitiş");
 if(!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(code)||statement.length<20||kriName.length<5||metricUnit.length<1)throw new Error("Kod, iştah beyanı, KRI ve ölçüm birimi zorunludur.");
 if(!RISK_CATEGORIES.includes(category as typeof RISK_CATEGORIES[number])||!RISK_DIRECTIONS.includes(direction as typeof RISK_DIRECTIONS[number]))throw new Error("Risk kategorisi veya eşik yönü geçersiz.");
 if(owner===reviewer)throw new Error("Risk sahibi ve bağımsız reviewer farklı olmalıdır.");
 if(validUntil<validFrom||validUntil<today)throw new Error("Geçerlilik bitişi başlangıçtan ve bugünden sonra olmalıdır.");
 if(direction==="upper"&&!(appetiteTarget<=warningThreshold&&warningThreshold<breachThreshold))throw new Error("Üst sınır KRI için iştah ≤ uyarı < ihlal olmalıdır.");
 if(direction==="lower"&&!(appetiteTarget>=warningThreshold&&warningThreshold>breachThreshold))throw new Error("Alt sınır KRI için iştah ≥ uyarı > ihlal olmalıdır.");
 return{code,category,statement,kriName,metricUnit,direction,appetiteTarget,warningThreshold,breachThreshold,owner,reviewer,frequencyDays,validFrom,validUntil};
}

export function classifyKri(value:number,direction:string,warning:number,breach:number){if(direction==="upper")return value>=breach?"red":value>=warning?"amber":"green";if(direction==="lower")return value<=breach?"red":value<=warning?"amber":"green";throw new Error("KRI eşik yönü geçersiz.")}

export function validateKriMeasurement(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const appetiteId=clean(input.appetiteId,100),periodStart=date(input.periodStart,"Dönem başlangıcı"),periodEnd=date(input.periodEnd,"Dönem bitişi"),value=number(input.value,"Ölçüm"),sourceRef=clean(input.sourceRef,500),evidenceSha256=clean(input.evidenceSha256,64).toLowerCase(),note=clean(input.note,1600);
 if(!appetiteId||periodEnd<periodStart||periodEnd>today||sourceRef.length<3||!/^[a-f0-9]{64}$/.test(evidenceSha256)||note.length<5)throw new Error("Geçmiş/geçerli KRI dönemi, kaynak, açıklama ve 64 karakter SHA-256 kanıtı zorunludur.");
 return{appetiteId,periodStart,periodEnd,value,sourceRef,evidenceSha256,note};
}

export function validateBreachPlan(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const responseOwner=email(input.responseOwner,"Aksiyon sahibi"),responsePlan=clean(input.responsePlan,2400),dueDate=date(input.dueDate,"Termin");if(responsePlan.length<20||dueDate<today)throw new Error("En az 20 karakter müdahale planı ve ileri tarihli termin zorunludur.");return{responseOwner,responsePlan,dueDate};
}

export function validateRiskScenario(input:Record<string,unknown>,today=new Date().toISOString().slice(0,10)){
 const appetiteId=clean(input.appetiteId,100),name=clean(input.name,240),horizonDays=number(input.horizonDays,"Ufuk",1,1095),baselineValue=number(input.baselineValue,"Baz değer"),stressedValue=number(input.stressedValue,"Stres değeri"),forecastValue=number(input.forecastValue,"Tahmin"),confidence=number(input.confidence,"Güven",1,100),assumptions=clean(input.assumptions,2400),treatmentPlan=clean(input.treatmentPlan,2400),owner=email(input.owner,"Senaryo sahibi"),reviewer=email(input.reviewer,"Reviewer"),dueDate=date(input.dueDate,"Termin");
 if(!appetiteId||name.length<5||assumptions.length<20||treatmentPlan.length<20||dueDate<today)throw new Error("Senaryo, varsayım, tedavi planı ve ileri tarihli termin zorunludur.");if(owner===reviewer)throw new Error("Senaryo sahibi ve bağımsız reviewer farklı olmalıdır.");return{appetiteId,name,horizonDays,baselineValue,stressedValue,forecastValue,confidence,assumptions,treatmentPlan,owner,reviewer,dueDate};
}

export function validateRiskAction(input:Record<string,unknown>){
 const operation=clean(input.operation,40),note=clean(input.note,1800),confirmation=clean(input.confirmation,100),evidenceReference=clean(input.evidenceReference,500),evidenceSha256=clean(input.evidenceSha256,64).toLowerCase();
 const phrases:Record<string,string>={submit:"RİSK İŞTAHINI İNCELEMEYE GÖNDER",approve:"RİSK İŞTAHINI ONAYLA",reject:"RİSK İŞTAHINI REDDET",retire:"RİSK İŞTAHINI YÜRÜRLÜKTEN KALDIR","start-breach":"İHLAL AKSİYONUNU BAŞLAT","submit-breach":"İHLALİ DOĞRULAMAYA GÖNDER","close-breach":"İHLALİ KAPAT","reopen-breach":"İHLALİ YENİDEN AÇ","submit-scenario":"SENARYOYU İNCELEMEYE GÖNDER","verify-scenario":"SENARYOYU DOĞRULA","approve-board":"YÖNETİM KURULU PAKETİNİ ONAYLA"};
 if(!phrases[operation]||confirmation!==phrases[operation]||note.length<5)throw new Error(`${phrases[operation]||"Geçerli işlem"} onayı ve açıklama zorunludur.`);
 if(["submit","approve","retire","submit-breach","close-breach","verify-scenario","approve-board"].includes(operation)&&(!evidenceReference||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw new Error("Kanıt referansı ve 64 karakter SHA-256 zorunludur.");
 return{operation,note,evidenceReference,evidenceSha256};
}

export function appetiteAttention(status:string,nextMeasurement:string,latestBand:string,openBreaches:number,now=new Date()){if(status==="retired"||status==="rejected")return status;const today=now.toISOString().slice(0,10);if(openBreaches>0||latestBand==="red")return"breached";if(latestBand==="amber")return"warning";if(nextMeasurement&&nextMeasurement<today)return"measurement-overdue";const days=Math.ceil((new Date(`${nextMeasurement}T23:59:59Z`).getTime()-now.getTime())/86_400_000);if(nextMeasurement&&days<=7)return"measurement-due";return status}
export function nextMeasurementDate(periodEnd:string,frequencyDays:number){const value=new Date(`${periodEnd}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+frequencyDays);return value.toISOString().slice(0,10)}
export function canonicalJson(value:unknown):string{if(value===undefined)return"null";if(Array.isArray(value))return`[${value.map(canonicalJson).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;return JSON.stringify(value)}
