import {ensureAssuranceNotificationSchema} from "./assurance-executive-operations";

export type AssuranceNotificationPolicy={criticalSlaMinutes:number;highSlaMinutes:number;mediumSlaMinutes:number;maxAttempts:number};
export type AssuranceDeliveryOutbox={id:string;escalation_id:string;recipient:string;route:string;subject:string;body:string;severity:string;status:string;reason:string;created_at:string;updated_at:string};
export type AssuranceDeliveryRecord={id:string;outbox_id:string;attempt:number;provider:string;state:string;detail:string;recipient:string;attempted_by:string;attempted_at:string};

export const defaultAssuranceNotificationPolicy:AssuranceNotificationPolicy={criticalSlaMinutes:240,highSlaMinutes:1440,mediumSlaMinutes:4320,maxAttempts:3};
export const assuranceNotificationDeliverySchema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_deliveries(id TEXT PRIMARY KEY,outbox_id TEXT NOT NULL,attempt INTEGER NOT NULL,provider TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL,recipient TEXT NOT NULL,attempted_by TEXT NOT NULL,attempted_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS ca_notification_delivery_outbox_idx ON continuous_assurance_notification_deliveries(outbox_id,attempted_at)`,
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_policy(id TEXT PRIMARY KEY,critical_sla_minutes INTEGER NOT NULL,high_sla_minutes INTEGER NOT NULL,medium_sla_minutes INTEGER NOT NULL,max_attempts INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)`,
];

export async function ensureAssuranceNotificationDeliverySchema(db:D1Database){await ensureAssuranceNotificationSchema(db);for(const sql of assuranceNotificationDeliverySchema)await db.prepare(sql).run()}
export async function readAssuranceNotificationPolicy(db:D1Database):Promise<AssuranceNotificationPolicy>{const row=await db.prepare("SELECT critical_sla_minutes,high_sla_minutes,medium_sla_minutes,max_attempts FROM continuous_assurance_notification_policy WHERE id='default'").first<{critical_sla_minutes:number;high_sla_minutes:number;medium_sla_minutes:number;max_attempts:number}>();return row?{criticalSlaMinutes:row.critical_sla_minutes,highSlaMinutes:row.high_sla_minutes,mediumSlaMinutes:row.medium_sla_minutes,maxAttempts:row.max_attempts}:defaultAssuranceNotificationPolicy}
export const assuranceSlaMinutes=(severity:string,p:AssuranceNotificationPolicy)=>severity==="critical"?p.criticalSlaMinutes:severity==="high"?p.highSlaMinutes:p.mediumSlaMinutes;
export const assuranceNotificationAgeMinutes=(value:string,now=new Date())=>{const time=new Date(value).getTime();return Number.isFinite(time)?Math.max(0,Math.floor((now.getTime()-time)/60_000)):0};
export async function readAssuranceDeliveryData(db:D1Database){const outbox=(await db.prepare("SELECT id,escalation_id,recipient,route,subject,body,severity,status,reason,created_at,updated_at FROM continuous_assurance_notification_outbox ORDER BY updated_at DESC LIMIT 2000").all<AssuranceDeliveryOutbox>()).results||[],deliveries=(await db.prepare("SELECT id,outbox_id,attempt,provider,state,detail,recipient,attempted_by,attempted_at FROM continuous_assurance_notification_deliveries ORDER BY attempted_at DESC LIMIT 5000").all<AssuranceDeliveryRecord>()).results||[];return{outbox,deliveries}}
export function summarizeAssuranceDelivery(outbox:AssuranceDeliveryOutbox[],deliveries:AssuranceDeliveryRecord[],p:AssuranceNotificationPolicy,now=new Date()){
 const byOutbox=new Map<string,AssuranceDeliveryRecord[]>();for(const item of deliveries)byOutbox.set(item.outbox_id,[...(byOutbox.get(item.outbox_id)||[]),item]);
 const queue=outbox.filter(item=>item.status==="queued"&&item.recipient),pending=queue.filter(item=>!(byOutbox.get(item.id)||[]).some(x=>x.state==="sent")),sent=queue.filter(item=>(byOutbox.get(item.id)||[]).some(x=>x.state==="sent")),failed=pending.filter(item=>(byOutbox.get(item.id)||[]).some(x=>x.state==="failed")),slaBreaches=pending.filter(item=>assuranceNotificationAgeMinutes(item.created_at,now)>assuranceSlaMinutes(item.severity,p));
 return{pending:pending.length,sent:sent.length,failed:failed.length,inAppOnly:outbox.filter(item=>item.status==="queued"&&!item.recipient).length,slaBreaches:slaBreaches.length,breaches:slaBreaches.slice(0,50).map(item=>({id:item.id,severity:item.severity,recipient:item.recipient,subject:item.subject,ageMinutes:assuranceNotificationAgeMinutes(item.created_at,now),slaMinutes:assuranceSlaMinutes(item.severity,p)}))};
}
