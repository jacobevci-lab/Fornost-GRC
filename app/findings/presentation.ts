type Lang='tr'|'en';
const labels:Record<string,readonly [string,string]>={
 audit:['Denetim','Audit'],control:['Kontrol','Control'],'continuous-control':['Sürekli kontrol','Continuous control'],vendor:['Tedarikçi','Vendor'],regulatory:['Mevzuat','Regulatory'],risk:['Risk','Risk'],policy:['Politika','Policy'],incident:['Olay','Incident'],vulnerability:['Zafiyet','Vulnerability'],ai:['Yapay zekâ','AI'],manual:['Manuel','Manual'],
 nonconformity:['Uygunsuzluk','Nonconformity'],'control-deficiency':['Kontrol eksikliği','Control deficiency'],observation:['Gözlem','Observation'],'incident-action':['Olay aksiyonu','Incident action'],improvement:['İyileştirme','Improvement'],
 low:['Düşük','Low'],medium:['Orta','Medium'],high:['Yüksek','High'],critical:['Kritik','Critical'],
 open:['Açık','Open'],'in-progress':['Devam ediyor','In progress'],verification:['Doğrulamada','In verification'],closed:['Kapalı','Closed'],accepted:['Risk kabul edildi','Risk accepted'],priority:['Öncelikli','Priority'],overdue:['Gecikmiş','Overdue'],'acceptance-expired':['Risk kabul süresi doldu','Risk acceptance expired'],
 start:['CAPA başlatıldı','CAPA started'],submit:['Doğrulamaya gönderildi','Submitted for verification'],verify:['Doğrulandı ve kapatıldı','Verified and closed'],reopen:['Yeniden açıldı','Reopened'],'accept-risk':['Risk kabul edildi','Risk accepted'],
 'finding-create':['Bulgu oluşturuldu','Finding created'],'continuous-assurance-promotion':['Sürekli kontrolden oluşturuldu','Created from continuous assurance'],'finding-export':['CSV dışa aktarıldı','CSV exported'],'finding-report-snapshot':['Rapor hazırlanmaya başlandı','Report snapshot started'],
};
export function findingLabel(value:string,lang:Lang){return Object.hasOwn(labels,value)?labels[value][lang==='tr'?0:1]:value||'—';}
export function findingTimestamp(value:string,lang:Lang){
 const date=new Date(value);
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(lang==='tr'?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC':value||'—';
}
type DecisionRecord={status:string;owner:string;reviewer:string;detectedBy?:string|null;submittedBy?:string|null};
/** Presentation only: the API remains authoritative for roles, lineage and evidence gates. */
export function findingActionAvailability(finding:DecisionRecord,user:{role:string;email:string}){
 const admin=user.role==='Admin',owner=user.role==='Editor'&&finding.owner===user.email;
 const reviewer=admin&&finding.reviewer===user.email&&!!finding.detectedBy&&![finding.owner,finding.detectedBy].includes(user.email);
 return {start:finding.status==='open'&&(admin||owner),submit:finding.status==='in-progress'&&(admin||owner),verify:finding.status==='verification'&&reviewer&&!!finding.submittedBy&&finding.submittedBy!==user.email,acceptRisk:['open','in-progress'].includes(finding.status)&&reviewer,reopen:['verification','closed','accepted'].includes(finding.status)&&admin};
}
