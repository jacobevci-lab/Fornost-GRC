export const crisisTable = `CREATE TABLE IF NOT EXISTS incident_crisis_context(
 incident_id TEXT PRIMARY KEY NOT NULL, detected_at TEXT, vendor_ref TEXT, awareness_at TEXT,
 notification_regime TEXT, notification_scope TEXT)`;
export const personalNoticeHours=72;
export function instant(value:unknown,now=Date.now()){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))throw Error('INVALID_INCIDENT_TIME');
 const n=Date.parse(value);if(!Number.isFinite(n)||n>now||new Date(n).toISOString()!==value)throw Error('INVALID_INCIDENT_TIME');
 return value;
}
export function noticeClock(start:string|null|undefined,now:number){
 const n=start?Date.parse(start):NaN;if(!Number.isFinite(n))return null;
 const due=n+personalNoticeHours*3600000,ms=due-now,minutes=Math.ceil(Math.abs(ms)/60000);
 return {due,late:ms<=0,hours:Math.floor(minutes/60),minutes:minutes%60};
}
export type CrisisTarget={id:string;code:string;title:string;module:string;rto:unknown;mtpd:unknown};
export type CrisisDetails={targets:CrisisTarget[];people:{email:string;name:string;status:string}[];restoredAt:string|null;finding:{id:string;code:string}|null};
export function localInput(value=new Date()){
 return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
}

const choices={kvkk:['KVKK','KVKK'],gdpr:['GDPR','GDPR'],bothRegimes:['KVKK ve GDPR','KVKK and GDPR'],authority:['Yetkili kurum','Supervisory authority'],individuals:['İlgili kişiler','Affected individuals'],both:['Kurum ve ilgili kişiler','Authority and affected individuals']} as const;
export function noticeLabel(value:string,tr:boolean){return choices[value as keyof typeof choices]?.[tr?0:1]||value;}

export function eventText(action:string,detail:string,tr:boolean){
 if(action!=='record-notification')return detail;
 try{
  const d=JSON.parse(detail);
  const decision=d.decision==='required'?(tr?'Bildirim gerekli':'Notification required'):(tr?'Bildirim gerekmiyor':'Notification not required');
  return [decision,noticeLabel(d.regime==='both'?'bothRegimes':d.regime,tr),noticeLabel(d.scope,tr),d.rationale].join(' · ');
 }catch{return detail;}
}
