import {assuranceWorkAgeHours,assuranceWorkSlaHours,assuranceWorkSlaState,type AssuranceQueueItem} from "./assurance-work-queue-metrics";

export type AssuranceAlertSeverity="medium"|"high"|"critical";
export type AssuranceAlertSignal={fingerprint:string;type:string;refType:string;refId:string;severity:AssuranceAlertSeverity;title:string;detail:string};
export type AssuranceAlertWorkItem=AssuranceQueueItem&{id:string;findingTitle?:string;ruleId?:string};
export type AssuranceAlertException={id:string;status:string;expiresAt:string;controlRef?:string;ruleId?:string;riskRef?:string;findingId?:string};
export type AssuranceAlertRisk={id:string;title?:string;owner?:string;residualRiskReviewRequired?:boolean;assuranceState?:string};
export type AssuranceAlertFinding={id:string;title:string;severity:string;status:string;dueDate:string;ruleId?:string};

const fp=(type:string,ref:string)=>`${type}:${ref}`;
const validDate=(value:string)=>{const date=new Date(value);return Number.isFinite(date.getTime())?date:null};
const daysUntil=(value:string,now:Date)=>{const date=validDate(value);return date?Math.ceil((date.getTime()-now.getTime())/86_400_000):Number.POSITIVE_INFINITY};
const severity=(value:string):AssuranceAlertSeverity=>String(value).toLowerCase()==="critical"?"critical":String(value).toLowerCase()==="high"?"high":"medium";

export function buildAssuranceAlertSignals(input:{workItems?:AssuranceAlertWorkItem[];exceptions?:AssuranceAlertException[];risks?:AssuranceAlertRisk[];findings?:AssuranceAlertFinding[]},now=new Date()):AssuranceAlertSignal[]{
 const signals:AssuranceAlertSignal[]=[];
 for(const item of input.workItems||[]){
  const itemSeverity=severity(String(item.severity||"medium"));
  if(item.status==="failed-retest")signals.push({fingerprint:fp("retest-failed",item.id),type:"retest-failed",refType:"work-item",refId:item.id,severity:itemSeverity==="critical"?"critical":"high",title:item.findingTitle||"Control re-test failed",detail:`${item.ruleId||item.id} yeniden testten geçemedi; assurance ve bağlı risk yeniden değerlendirilmelidir.`});
  if(item.status==="retest-error")signals.push({fingerprint:fp("retest-error",item.id),type:"retest-error",refType:"work-item",refId:item.id,severity:"high",title:item.findingTitle||"Control re-test error",detail:`${item.ruleId||item.id} yeniden testinde yürütme hatası oluştu.`});
  if(assuranceWorkSlaState(item,now)==="breached"){
   const age=assuranceWorkAgeHours(item,now),sla=assuranceWorkSlaHours(item),alertSeverity:itemSeverity==="critical"||age>=sla*2?"critical":"high";
   signals.push({fingerprint:fp("work-sla-breached",item.id),type:"work-sla-breached",refType:"work-item",refId:item.id,severity:alertSeverity,title:item.findingTitle||"Assurance work SLA breached",detail:`${item.action} işi ${Math.round(age)} saattir açık; ${sla} saatlik SLA aşıldı.`});
  }
 }
 const today=now.toISOString().slice(0,10);
 for(const item of input.exceptions||[]){
  const ref=item.controlRef||item.riskRef||item.ruleId||item.findingId||item.id,days=daysUntil(item.expiresAt,now);
  if(item.status==="active"&&item.expiresAt<today)signals.push({fingerprint:fp("exception-expired",item.id),type:"exception-expired",refType:"exception",refId:item.id,severity:"critical",title:`Assurance exception expired · ${ref}`,detail:`Exception ${item.expiresAt} tarihinde sona erdi; istisna artık assurance kararını desteklememelidir.`});
  else if(item.status==="active"&&days<=14)signals.push({fingerprint:fp("exception-expiring",item.id),type:"exception-expiring",refType:"exception",refId:item.id,severity:days<=3?"high":"medium",title:`Assurance exception expiring · ${ref}`,detail:`Exception ${Math.max(0,days)} gün içinde (${item.expiresAt}) sona erecek.`});
  else if(item.status==="pending-review"&&item.expiresAt<today)signals.push({fingerprint:fp("exception-review-expired",item.id),type:"exception-review-expired",refType:"exception",refId:item.id,severity:"high",title:`Pending exception expired · ${ref}`,detail:"Onay bekleyen exception süresi doldu; yeni talep açılması gerekiyor."});
 }
 for(const item of input.risks||[]){
  if(item.residualRiskReviewRequired===true){const ineffective=String(item.assuranceState||"").toLowerCase()==="ineffective";signals.push({fingerprint:fp("risk-review-required",item.id),type:"risk-review-required",refType:"risk",refId:item.id,severity:ineffective?"high":"medium",title:item.title||`Risk review required · ${item.id}`,detail:`${item.owner||"Risk owner"} için Continuous Assurance sonrası residual risk kararı bekleniyor.`})}
 }
 for(const item of input.findings||[]){
  const sev=severity(item.severity),due=validDate(item.dueDate),closed=["closed","accepted"].includes(String(item.status).toLowerCase());
  if(!closed&&due&&due.getTime()<now.getTime()&&(sev==="critical"||sev==="high"))signals.push({fingerprint:fp("finding-overdue",item.id),type:"finding-overdue",refType:"finding",refId:item.id,severity:sev,title:item.title||"Assurance finding overdue",detail:`${item.ruleId||item.id} bulgusu ${item.dueDate} terminini aştı.`});
 }
 return Array.from(new Map(signals.map(signal=>[signal.fingerprint,signal])).values());
}

export type AssuranceEscalationLevel="none"|"owner"|"management"|"executive";
export function assuranceAlertEscalation(severity:AssuranceAlertSeverity,firstSeenAt:string,now=new Date()):AssuranceEscalationLevel{
 const first=validDate(firstSeenAt);if(!first)return severity==="critical"?"owner":"none";const hours=Math.max(0,(now.getTime()-first.getTime())/3_600_000);
 if(severity==="critical")return hours>=24?"executive":hours>=4?"management":"owner";
 if(severity==="high")return hours>=72?"executive":hours>=24?"management":"owner";
 return hours>=72?"management":hours>=24?"owner":"none";
}
