import {deliverConfiguredEmail} from "./api/integrations/email-transport";
import {ensureAssuranceNotificationDeliverySchema,readAssuranceDeliveryData,readAssuranceNotificationPolicy,type AssuranceDeliveryRecord,type AssuranceDeliveryOutbox} from "./assurance-notification-delivery";

type Env=Record<string,unknown>;
export type AssuranceDispatchTrigger="manual"|"scheduled";
export type AssuranceDispatchRun={id:string;trigger:AssuranceDispatchTrigger;actor:string;startedAt:string;completedAt:string;status:"running"|"success"|"partial"|"failed"|"noop";requestedLimit:number;candidates:number;sent:number;failed:number;skipped:number;detail:string};
export type AssuranceDispatchResult=AssuranceDispatchRun&{transportConfigured:boolean;results:Array<{outboxId:string;recipient:string;state:string;provider:string;attempt:number}>};

const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_leases(outbox_id TEXT PRIMARY KEY,lease_token TEXT NOT NULL,leased_until TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS ca_notification_leases_until_idx ON continuous_assurance_notification_leases(leased_until)`,
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_dispatch_runs(id TEXT PRIMARY KEY,trigger TEXT NOT NULL,actor TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,requested_limit INTEGER NOT NULL,candidates INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,skipped INTEGER NOT NULL DEFAULT 0,detail TEXT NOT NULL DEFAULT '')`,
 `CREATE INDEX IF NOT EXISTS ca_notification_dispatch_runs_started_idx ON continuous_assurance_notification_dispatch_runs(started_at DESC)`,
];

export function notificationRetryDelayMinutes(failedAttempts:number){if(failedAttempts<=0)return 0;return Math.min(360,15*Math.pow(2,failedAttempts-1))}
export async function ensureAssuranceNotificationDispatchSchema(db:D1Database){await ensureAssuranceNotificationDeliverySchema(db);for(const sql of schema)await db.prepare(sql).run()}

export async function readAssuranceNotificationDispatchRuns(db:D1Database,limit=25):Promise<AssuranceDispatchRun[]>{
 await ensureAssuranceNotificationDispatchSchema(db);const count=Math.max(1,Math.min(100,Math.floor(limit)||25));
 const rows=await db.prepare("SELECT id,trigger,actor,started_at,completed_at,status,requested_limit,candidates,sent,failed,skipped,detail FROM continuous_assurance_notification_dispatch_runs ORDER BY started_at DESC LIMIT ?").bind(count).all<{id:string;trigger:AssuranceDispatchTrigger;actor:string;started_at:string;completed_at:string;status:AssuranceDispatchRun["status"];requested_limit:number;candidates:number;sent:number;failed:number;skipped:number;detail:string}>();
 return rows.results.map(row=>({id:row.id,trigger:row.trigger,actor:row.actor,startedAt:row.started_at,completedAt:row.completed_at,status:row.status,requestedLimit:row.requested_limit,candidates:row.candidates,sent:row.sent,failed:row.failed,skipped:row.skipped,detail:row.detail}));
}

const historyByOutbox=(deliveries:AssuranceDeliveryRecord[])=>{const map=new Map<string,AssuranceDeliveryRecord[]>();for(const item of deliveries)map.set(item.outbox_id,[...(map.get(item.outbox_id)||[]),item]);return map};
const severityRank=(value:string)=>({critical:0,high:1,medium:2}[value as "critical"|"high"|"medium"]??3);
const eligibleAfter=(history:AssuranceDeliveryRecord[])=>{const failed=history.filter(item=>item.state==="failed");if(!failed.length)return 0;const latest=failed.reduce((a,b)=>a.attempted_at>b.attempted_at?a:b),delay=notificationRetryDelayMinutes(failed.length);return new Date(latest.attempted_at).getTime()+delay*60_000};
const isCandidate=(item:AssuranceDeliveryOutbox,history:AssuranceDeliveryRecord[],maxAttempts:number,nowMs:number)=>item.status==="queued"&&!!item.recipient&&!history.some(x=>x.state==="sent")&&history.filter(x=>x.state==="failed").length<maxAttempts&&eligibleAfter(history)<=nowMs;

async function acquireLease(db:D1Database,outboxId:string,now:Date){
 const token=crypto.randomUUID(),stamp=now.toISOString(),leasedUntil=new Date(now.getTime()+120_000).toISOString();
 await db.prepare(`INSERT INTO continuous_assurance_notification_leases(outbox_id,lease_token,leased_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(outbox_id) DO UPDATE SET lease_token=excluded.lease_token,leased_until=excluded.leased_until,updated_at=excluded.updated_at WHERE continuous_assurance_notification_leases.leased_until<=?`).bind(outboxId,token,leasedUntil,stamp,stamp).run();
 const row=await db.prepare("SELECT lease_token FROM continuous_assurance_notification_leases WHERE outbox_id=?").bind(outboxId).first<{lease_token:string}>();return row?.lease_token===token?token:"";
}
async function releaseLease(db:D1Database,outboxId:string,token:string){if(token)await db.prepare("DELETE FROM continuous_assurance_notification_leases WHERE outbox_id=? AND lease_token=?").bind(outboxId,token).run()}
async function liveHistory(db:D1Database,outboxId:string){const rows=await db.prepare("SELECT id,outbox_id,attempt,provider,state,detail,recipient,attempted_by,attempted_at FROM continuous_assurance_notification_deliveries WHERE outbox_id=? ORDER BY attempted_at").bind(outboxId).all<AssuranceDeliveryRecord>();return rows.results}

export async function dispatchAssuranceNotifications(db:D1Database,env:Env,options:{actor:string;trigger:AssuranceDispatchTrigger;limit?:number;now?:Date}):Promise<AssuranceDispatchResult>{
 await ensureAssuranceNotificationDispatchSchema(db);const now=options.now||new Date(),startedAt=now.toISOString(),runId=`CAD-${crypto.randomUUID()}`,requestedLimit=Math.max(1,Math.min(50,Math.floor(options.limit||20))),actor=String(options.actor||"system:assurance-dispatch").slice(0,320);
 await db.prepare("DELETE FROM continuous_assurance_notification_leases WHERE leased_until<=?").bind(startedAt).run();
 await db.prepare("INSERT INTO continuous_assurance_notification_dispatch_runs(id,trigger,actor,started_at,status,requested_limit) VALUES(?,?,?,?,?,?)").bind(runId,options.trigger,actor,startedAt,"running",requestedLimit).run();
 const configured=await db.prepare("SELECT provider,enabled FROM integration_settings WHERE kind='email'").first<{provider:string;enabled:number}>().catch(()=>null);
 if(!configured||!configured.enabled){const completedAt=new Date().toISOString(),detail="No enabled email transport is configured.";await db.prepare("UPDATE continuous_assurance_notification_dispatch_runs SET completed_at=?,status='failed',detail=? WHERE id=?").bind(completedAt,detail,runId).run();return{id:runId,trigger:options.trigger,actor,startedAt,completedAt,status:"failed",requestedLimit,candidates:0,sent:0,failed:0,skipped:0,detail,transportConfigured:false,results:[]}}
 const policy=await readAssuranceNotificationPolicy(db),data=await readAssuranceDeliveryData(db),history=historyByOutbox(data.deliveries),nowMs=now.getTime();
 const candidates=data.outbox.filter(item=>isCandidate(item,history.get(item.id)||[],policy.maxAttempts,nowMs)).sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||a.created_at.localeCompare(b.created_at)).slice(0,requestedLimit);
 let sent=0,failed=0,skipped=0;const results:AssuranceDispatchResult["results"]=[];
 for(const item of candidates){const leaseNow=new Date(),token=await acquireLease(db,item.id,leaseNow);if(!token){skipped++;continue}try{
   const current=await liveHistory(db,item.id);if(!isCandidate(item,current,policy.maxAttempts,leaseNow.getTime())){skipped++;continue}
   const attempt=current.filter(x=>x.state==="failed"||x.state==="sent").length+1,result=await deliverConfiguredEmail(db,env,{to:item.recipient,subject:`[Fornost ${item.severity.toUpperCase()}] ${item.subject}`,text:`${item.body}\n\nFornost Continuous Assurance\nEscalation: ${item.escalation_id}\nReason: ${item.reason}`}),stamp=new Date().toISOString(),state=result.sent?"sent":"failed";
   await db.prepare("INSERT INTO continuous_assurance_notification_deliveries(id,outbox_id,attempt,provider,state,detail,recipient,attempted_by,attempted_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),item.id,attempt,result.provider,state,result.detail,item.recipient,actor,stamp).run();if(result.sent)sent++;else failed++;results.push({outboxId:item.id,recipient:item.recipient,state,provider:result.provider,attempt});
  }finally{await releaseLease(db,item.id,token)}}
 const completedAt=new Date().toISOString(),status:AssuranceDispatchRun["status"]=candidates.length===0?"noop":failed===0?"success":sent>0?"partial":"failed",detail=candidates.length===0?"No eligible notifications were due.":`${sent} transport accepted; ${failed} failed; ${skipped} skipped.`;
 await db.prepare("UPDATE continuous_assurance_notification_dispatch_runs SET completed_at=?,status=?,candidates=?,sent=?,failed=?,skipped=?,detail=? WHERE id=?").bind(completedAt,status,candidates.length,sent,failed,skipped,detail,runId).run();
 return{id:runId,trigger:options.trigger,actor,startedAt,completedAt,status,requestedLimit,candidates:candidates.length,sent,failed,skipped,detail,transportConfigured:true,results};
}
