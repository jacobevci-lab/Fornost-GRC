import {deliverConfiguredEmail} from "./api/integrations/email-transport";
import {ensureAssuranceNotificationDeliverySchema,failedAttemptsSinceReset,latestRetryResetByOutbox,readAssuranceDeliveryData,readAssuranceNotificationPolicy,type AssuranceDeliveryRecord,type AssuranceDeliveryOutbox,type AssuranceNotificationRetryReset} from "./assurance-notification-delivery";

type Env=Record<string,unknown>;
export type AssuranceDispatchTrigger="manual"|"scheduled";
export type AssuranceDispatchRun={id:string;trigger:AssuranceDispatchTrigger;actor:string;startedAt:string;completedAt:string;status:"running"|"success"|"partial"|"failed"|"noop";requestedLimit:number;candidates:number;sent:number;failed:number;skipped:number;detail:string};
export type AssuranceDispatchResult=AssuranceDispatchRun&{transportConfigured:boolean;results:Array<{outboxId:string;recipient:string;state:string;provider:string;attempt:number}>};
export type AssuranceSchedulerHealth={state:"healthy"|"degraded"|"stale"|"unknown";cadenceMinutes:number;lastScheduledAt:string;ageMinutes:number|null;lastScheduledStatus:string};

const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_leases(outbox_id TEXT PRIMARY KEY,lease_token TEXT NOT NULL,leased_until TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS ca_notification_leases_until_idx ON continuous_assurance_notification_leases(leased_until)`,
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_dispatch_runs(id TEXT PRIMARY KEY,trigger TEXT NOT NULL,actor TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,requested_limit INTEGER NOT NULL,candidates INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,skipped INTEGER NOT NULL DEFAULT 0,detail TEXT NOT NULL DEFAULT '')`,
 `CREATE INDEX IF NOT EXISTS ca_notification_dispatch_runs_started_idx ON continuous_assurance_notification_dispatch_runs(started_at DESC)`,
];

export function notificationRetryDelayMinutes(failedAttempts:number){if(failedAttempts<=0)return 0;return Math.min(360,15*Math.pow(2,failedAttempts-1))}
export function summarizeAssuranceSchedulerHealth(runs:AssuranceDispatchRun[],now=new Date(),cadenceMinutes=15):AssuranceSchedulerHealth{const scheduled=runs.filter(run=>run.trigger==="scheduled").sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),latest=scheduled[0];if(!latest)return{state:"unknown",cadenceMinutes,lastScheduledAt:"",ageMinutes:null,lastScheduledStatus:""};const started=new Date(latest.startedAt).getTime(),ageMinutes=Number.isFinite(started)?Math.max(0,Math.floor((now.getTime()-started)/60_000)):null;if(ageMinutes===null)return{state:"unknown",cadenceMinutes,lastScheduledAt:latest.startedAt,ageMinutes:null,lastScheduledStatus:latest.status};const stale=ageMinutes>cadenceMinutes*4;if(stale)return{state:"stale",cadenceMinutes,lastScheduledAt:latest.startedAt,ageMinutes,lastScheduledStatus:latest.status};const bad=latest.status==="failed"||latest.status==="partial"||latest.status==="running",late=ageMinutes>cadenceMinutes*2+5;return{state:bad||late?"degraded":"healthy",cadenceMinutes,lastScheduledAt:latest.startedAt,ageMinutes,lastScheduledStatus:latest.status}}
export async function ensureAssuranceNotificationDispatchSchema(db:D1Database){await ensureAssuranceNotificationDeliverySchema(db);for(const sql of schema)await db.prepare(sql).run()}

export async function readAssuranceNotificationDispatchRuns(db:D1Database,limit=25):Promise<AssuranceDispatchRun[]>{
 await ensureAssuranceNotificationDispatchSchema(db);const count=Math.max(1,Math.min(100,Math.floor(limit)||25));
 const rows=await db.prepare("SELECT id,trigger,actor,started_at,completed_at,status,requested_limit,candidates,sent,failed,skipped,detail FROM continuous_assurance_notification_dispatch_runs ORDER BY started_at DESC LIMIT ?").bind(count).all<{id:string;trigger:AssuranceDispatchTrigger;actor:string;started_at:string;completed_at:string;status:AssuranceDispatchRun["status"];requested_limit:number;candidates:number;sent:number;failed:number;skipped:number;detail:string}>();
 return rows.results.map(row=>({id:row.id,trigger:row.trigger,actor:row.actor,startedAt:row.started_at,completedAt:row.completed_at,status:row.status,requestedLimit:row.requested_limit,candidates:row.candidates,sent:row.sent,failed:row.failed,skipped:row.skipped,detail:row.detail}));
}

const historyByOutbox=(deliveries:AssuranceDeliveryRecord[])=>{const map=new Map<string,AssuranceDeliveryRecord[]>();for(const item of deliveries)map.set(item.outbox_id,[...(map.get(item.outbox_id)||[]),item]);return map};
const severityRank=(value:string)=>({critical:0,high:1,medium:2}[value as "critical"|"high"|"medium"]??3);
const eligibleAfter=(history:AssuranceDeliveryRecord[],reset?:AssuranceNotificationRetryReset|null)=>{const failed=failedAttemptsSinceReset(history,reset);if(!failed.length)return 0;const latest=failed.reduce((a,b)=>a.attempted_at>b.attempted_at?a:b),stamp=new Date(latest.attempted_at).getTime(),delay=notificationRetryDelayMinutes(failed.length);return Number.isFinite(stamp)?stamp+delay*60_000:0};
const isCandidate=(item:AssuranceDeliveryOutbox,history:AssuranceDeliveryRecord[],reset:AssuranceNotificationRetryReset|null|undefined,maxAttempts:number,nowMs:number)=>item.status==="queued"&&!!item.recipient&&!history.some(x=>x.state==="sent")&&failedAttemptsSinceReset(history,reset).length<maxAttempts&&eligibleAfter(history,reset)<=nowMs;

async function acquireLease(db:D1Database,outboxId:string,now:Date){
 const token=crypto.randomUUID(),stamp=now.toISOString(),leasedUntil=new Date(now.getTime()+120_000).toISOString();
 await db.prepare(`INSERT INTO continuous_assurance_notification_leases(outbox_id,lease_token,leased_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(outbox_id) DO UPDATE SET lease_token=excluded.lease_token,leased_until=excluded.leased_until,updated_at=excluded.updated_at WHERE continuous_assurance_notification_leases.leased_until<=?`).bind(outboxId,token,leasedUntil,stamp,stamp).run();
 const row=await db.prepare("SELECT lease_token FROM continuous_assurance_notification_leases WHERE outbox_id=?").bind(outboxId).first<{lease_token:string}>();return row?.lease_token===token?token:"";
}
async function releaseLease(db:D1Database,outboxId:string,token:string){if(token)await db.prepare("DELETE FROM continuous_assurance_notification_leases WHERE outbox_id=? AND lease_token=?").bind(outboxId,token).run()}
async function liveHistory(db:D1Database,outboxId:string){const rows=await db.prepare("SELECT id,outbox_id,attempt,provider,state,detail,recipient,attempted_by,attempted_at FROM continuous_assurance_notification_deliveries WHERE outbox_id=? ORDER BY attempted_at").bind(outboxId).all<AssuranceDeliveryRecord>();return rows.results}
async function liveRetryReset(db:D1Database,outboxId:string){return db.prepare("SELECT id,outbox_id,actor,reason,prior_failed_attempts,created_at FROM continuous_assurance_notification_retry_resets WHERE outbox_id=? ORDER BY created_at DESC LIMIT 1").bind(outboxId).first<AssuranceNotificationRetryReset>()}

export async function dispatchAssuranceNotifications(db:D1Database,env:Env,options:{actor:string;trigger:AssuranceDispatchTrigger;limit?:number;now?:Date}):Promise<AssuranceDispatchResult>{
 await ensureAssuranceNotificationDispatchSchema(db);const now=options.now||new Date(),startedAt=now.toISOString(),runId=`CAD-${crypto.randomUUID()}`,requestedLimit=Math.max(1,Math.min(50,Math.floor(options.limit||20))),actor=String(options.actor||"system:assurance-dispatch").slice(0,320),results:AssuranceDispatchResult["results"]=[];let sent=0,failed=0,skipped=0,candidateCount=0,transportConfigured=false;
 await db.prepare("DELETE FROM continuous_assurance_notification_leases WHERE leased_until<=?").bind(startedAt).run();
 await db.prepare("INSERT INTO continuous_assurance_notification_dispatch_runs(id,trigger,actor,started_at,status,requested_limit) VALUES(?,?,?,?,?,?)").bind(runId,options.trigger,actor,startedAt,"running",requestedLimit).run();
 try{
  const configured=await db.prepare("SELECT provider,enabled FROM integration_settings WHERE kind='email'").first<{provider:string;enabled:number}>().catch(()=>null);transportConfigured=!!configured?.enabled;
  if(!transportConfigured){const completedAt=new Date().toISOString(),detail="No enabled email transport is configured.";await db.prepare("UPDATE continuous_assurance_notification_dispatch_runs SET completed_at=?,status='failed',detail=? WHERE id=?").bind(completedAt,detail,runId).run();return{id:runId,trigger:options.trigger,actor,startedAt,completedAt,status:"failed",requestedLimit,candidates:0,sent:0,failed:0,skipped:0,detail,transportConfigured:false,results}}
  const policy=await readAssuranceNotificationPolicy(db),data=await readAssuranceDeliveryData(db),history=historyByOutbox(data.deliveries),resetMap=latestRetryResetByOutbox(data.retryResets),nowMs=now.getTime();
  const candidates=data.outbox.filter(item=>isCandidate(item,history.get(item.id)||[],resetMap.get(item.id),policy.maxAttempts,nowMs)).sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||a.created_at.localeCompare(b.created_at)).slice(0,requestedLimit);candidateCount=candidates.length;
  for(const item of candidates){const leaseNow=new Date(),token=await acquireLease(db,item.id,leaseNow);if(!token){skipped++;continue}try{
    const current=await liveHistory(db,item.id),reset=await liveRetryReset(db,item.id);if(!isCandidate(item,current,reset,policy.maxAttempts,leaseNow.getTime())){skipped++;continue}
    const attempt=current.filter(x=>x.state==="failed"||x.state==="sent").length+1,result=await deliverConfiguredEmail(db,env,{to:item.recipient,subject:`[Fornost ${item.severity.toUpperCase()}] ${item.subject}`,text:`${item.body}\n\nFornost Continuous Assurance\nEscalation: ${item.escalation_id}\nReason: ${item.reason}`}),stamp=new Date().toISOString(),state=result.sent?"sent":"failed";
    await db.prepare("INSERT INTO continuous_assurance_notification_deliveries(id,outbox_id,attempt,provider,state,detail,recipient,attempted_by,attempted_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),item.id,attempt,result.provider,state,result.detail,item.recipient,actor,stamp).run();if(result.sent)sent++;else failed++;results.push({outboxId:item.id,recipient:item.recipient,state,provider:result.provider,attempt});
   }finally{await releaseLease(db,item.id,token)}}
  const completedAt=new Date().toISOString(),status:AssuranceDispatchRun["status"]=candidateCount===0?"noop":failed===0?"success":sent>0?"partial":"failed",detail=candidateCount===0?"No eligible notifications were due.":`${sent} transport accepted; ${failed} failed; ${skipped} skipped.`;
  await db.prepare("UPDATE continuous_assurance_notification_dispatch_runs SET completed_at=?,status=?,candidates=?,sent=?,failed=?,skipped=?,detail=? WHERE id=?").bind(completedAt,status,candidateCount,sent,failed,skipped,detail,runId).run();
  return{id:runId,trigger:options.trigger,actor,startedAt,completedAt,status,requestedLimit,candidates:candidateCount,sent,failed,skipped,detail,transportConfigured,results};
 }catch(error){const completedAt=new Date().toISOString(),detail=(error instanceof Error?error.message:"Assurance notification dispatch failed.").slice(0,300);await db.prepare("UPDATE continuous_assurance_notification_dispatch_runs SET completed_at=?,status='failed',candidates=?,sent=?,failed=?,skipped=?,detail=? WHERE id=?").bind(completedAt,candidateCount,sent,failed,skipped,detail,runId).run();return{id:runId,trigger:options.trigger,actor,startedAt,completedAt,status:"failed",requestedLimit,candidates:candidateCount,sent,failed,skipped,detail,transportConfigured,results}}
}
