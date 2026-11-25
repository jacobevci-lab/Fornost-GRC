import {assuranceWorkSlaState,type AssuranceQueueItem} from './assurance-work-queue-metrics';
export const ASSURANCE_ATTENTION_SCAN_LIMIT=2000;
export function needsAssuranceAttention(item:AssuranceQueueItem,at:Date):boolean {
 return item.status==='failed-retest'||item.status==='retest-error'||['breached','unknown'].includes(assuranceWorkSlaState(item,at));
}
export function validAssuranceAssessment(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
 const date=new Date(value);
 return Number.isFinite(date.getTime())&&date.toISOString()===value;
}
export function parseAssuranceAssessment(value:string|null,continuation:boolean,now=new Date()):Date {
 if(value===null){if(continuation)throw new Error('Assessment time required');return now;}
 if(!validAssuranceAssessment(value))throw new Error('Invalid assessment time');
 const date=new Date(value),age=now.getTime()-date.getTime();
 if(age<0||age>86_400_000)throw new Error('Assessment expired; refresh');
 return date;
}
