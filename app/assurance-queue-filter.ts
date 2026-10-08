export type AssuranceQueueFilter = 'all'|'active'|'review'|'retest';
const statuses:Record<Exclude<AssuranceQueueFilter,'all'>,readonly string[]>={
 active:['pending-review','approved-awaiting-retest','failed-retest','retest-error'],
 review:['pending-review'],
 retest:['approved-awaiting-retest'],
};
export function parseAssuranceQueueFilter(value:string):AssuranceQueueFilter {
 if(!['all','active','review','retest'].includes(value))throw new Error('Invalid assurance filter');
 return value as AssuranceQueueFilter;
}
export function assuranceQueueFilterStatuses(filter:AssuranceQueueFilter):readonly string[] {
 return filter==='all'?[]:statuses[filter];
}
export function matchesAssuranceQueueFilter(status:string,filter:AssuranceQueueFilter):boolean {
 return filter==='all'||assuranceQueueFilterStatuses(filter).includes(status);
}
