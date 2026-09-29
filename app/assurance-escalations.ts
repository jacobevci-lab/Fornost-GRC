export type AssuranceEscalationSeverity="medium"|"high"|"critical";
export type ConnectorReliabilitySnapshot={runs24h:number;failRuns24h:number;errorRuns24h:number;successRate24h:number|null;unhealthyRules:number};

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
export function connectorReliabilitySeverity(snapshot:ConnectorReliabilitySnapshot):AssuranceEscalationSeverity|null{
 const runs=Math.max(0,Number(snapshot.runs24h)||0),failures=Math.max(0,Number(snapshot.failRuns24h)||0)+Math.max(0,Number(snapshot.errorRuns24h)||0),unhealthy=Math.max(0,Number(snapshot.unhealthyRules)||0);
 if(runs<1||failures<1||unhealthy<1)return null;
 const measured=snapshot.successRate24h,rate=measured!==null&&Number.isFinite(Number(measured))?Number(measured):Math.max(0,Math.min(100,((runs-failures)/runs)*100));
 if(Number(snapshot.errorRuns24h)>=3||(runs>=5&&rate<50))return "critical";
 return "high";
}
export const escalationRank=(severity:string)=>severity==="critical"?3:severity==="high"?2:severity==="medium"?1:0;
