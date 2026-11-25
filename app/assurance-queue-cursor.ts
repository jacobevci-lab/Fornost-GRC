export type AssuranceQueueCursor = [number,string,string];
export function parseAssuranceQueueCursor(value:string):AssuranceQueueCursor {
 if(value.length>1024)throw new Error('Invalid assurance cursor');
 let parts:unknown;try{parts=JSON.parse(value);}catch{throw new Error('Invalid assurance cursor');}
 if(!Array.isArray(parts)||parts.length!==3||!Number.isInteger(parts[0])||parts[0]<0||parts[0]>4||typeof parts[1]!=='string'||parts[1].length>100||typeof parts[2]!=='string'||!parts[2]||parts[2].length>200)throw new Error('Invalid assurance cursor');
 return parts as AssuranceQueueCursor;
}
export function assuranceQueueCursor(row:{status:string;updated_at:string;id:string}):string {
 const priority=['pending-review','approved-awaiting-retest','failed-retest','retest-error'].indexOf(row.status);
 return JSON.stringify([priority<0?4:priority,row.updated_at||'',row.id]);
}
