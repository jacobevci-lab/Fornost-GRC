export type AssuranceEscalationSeverity="medium"|"high"|"critical";

const validDay=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value};
export const daysUntil=(target:string,today:string)=>{
 if(!validDay(target)||!validDay(today))return Number.POSITIVE_INFINITY;
 return Math.ceil((new Date(`${target}T00:00:00Z`).getTime()-new Date(`${today}T00:00:00Z`).getTime())/86_400_000);
};
export function exceptionExpirySeverity(expiresAt:string,today:string,reminderDays:number):AssuranceEscalationSeverity|null{
 const remaining=daysUntil(expiresAt,today);
 if(!Number.isFinite(remaining)||remaining<0||remaining>reminderDays)return null;
 if(remaining<=1)return "critical";
 if(remaining<=3)return "high";
 return "medium";
}
export function riskReviewSeverity(urgency:string):AssuranceEscalationSeverity|null{
 if(urgency==="critical")return "critical";
 if(urgency==="overdue")return "high";
 if(urgency==="due-soon")return "medium";
 return null;
}
export const escalationRank=(severity:string)=>severity==="critical"?3:severity==="high"?2:severity==="medium"?1:0;
