export {requestJsonWithDeadline as findingsRequest} from "../bounded-json-request";
export function findingListPage<T extends {code:string;title:string;sourceRef:string;owner:string;status:string;attention:string}>(rows:T[],filter:string,query:string,requestedPage:number,lang:'tr'|'en') {
 const normalize=(value:string)=>value.toLocaleLowerCase(lang==='tr'?'tr-TR':'en-US');
 const needle=normalize(query.trim());
 const matching=rows.filter(row=>(filter==='all'||row.attention===filter||row.status===filter)&&normalize([row.code,row.title,row.sourceRef,row.owner].join(' ')).includes(needle));
 const pages=Math.max(1,Math.ceil(matching.length/20));
 const page=Math.min(pages,Math.max(1,Number.isFinite(requestedPage)?Math.floor(requestedPage):1));
 const offset=(page-1)*20;
 return {rows:matching.slice(offset,offset+20),page,pages,total:matching.length,start:matching.length?offset+1:0,end:Math.min(offset+20,matching.length)};
}
export function validFindingsPayload(body:Record<string,unknown>):boolean {
 const strings=['id','code','sourceType','sourceRef','sourceTitle','findingType','title','description','severity','owner','reviewer','rootCause','correctiveAction','preventiveAction','dueDate','status','attention','updatedAt'];
 const nullable=['riskRef','controlRef','acceptUntil','acceptanceRationale'];
 return Array.isArray(body.findings)&&body.findings.every(row=>row&&typeof row==='object'&&strings.every(key=>typeof row[key]==='string')&&nullable.every(key=>row[key]==null||typeof row[key]==='string')&&Number.isFinite(row.recurrenceCount))
  &&Array.isArray(body.events)&&body.events.every(row=>row&&typeof row==='object'&&['id','action','findingId','actor','detail'].every(key=>typeof row[key]==='string'))
  &&Array.isArray(body.sourceSignals)&&body.sourceSignals.every(row=>row&&typeof row.source==='string'&&Number.isFinite(row.count))
  &&!!body.summary&&typeof body.summary==='object'&&['total','open','critical','overdue','verification','accepted','closed','recurring'].every(key=>Number.isFinite((body.summary as Record<string,unknown>)[key]));
}

export type FindingPagination={page:number;pages:number;total:number;start:number;end:number};
export function validFindingPagination(value:unknown,length:number):value is FindingPagination {
 if(!value||typeof value!=='object')return false;
 const p=value as FindingPagination;
 return [p.page,p.pages,p.total,p.start,p.end].every(Number.isSafeInteger)&&p.total>=0&&p.pages===Math.max(1,Math.ceil(p.total/20))&&p.page>=1&&p.page<=p.pages&&p.start===(p.total?(p.page-1)*20+1:0)&&p.end===Math.min(p.page*20,p.total)&&length===(p.total?p.end-p.start+1:0);
}
