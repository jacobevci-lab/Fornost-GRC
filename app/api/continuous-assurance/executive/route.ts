import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {buildExecutiveOperationsSummary,buildOwnerAccountability,enrichAssuranceEscalationOwners,ensureAssuranceNotificationSchema,syncAssuranceNotificationOutbox,type AssuranceEscalationRecord} from "../../../assurance-executive-operations";

type Env=Record<string,unknown>&{DB:D1Database};
type OutboxRow={id:string;fingerprint:string;escalation_id:string;recipient:string;route:string;subject:string;body:string;severity:string;status:string;reason:string;created_at:string;updated_at:string;last_routed_at:string;closed_at:string|null;source_json:string};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
async function reminderConfig(db:D1Database){let reminderDays=15,remindersEnabled=true;try{const row=await db.prepare("SELECT config_json FROM platform_settings WHERE id='default'").first<{config_json:string}>();if(row){const value=parse(row.config_json),days=Number(value.reminderDays);if(Number.isInteger(days)&&days>=1&&days<=365)reminderDays=days;if(value.remindersEnabled===false)remindersEnabled=false}}catch{}return{reminderDays,remindersEnabled}}
async function escalationRows(db:D1Database){try{return (await db.prepare("SELECT id,kind,severity,subject_ref,owner,title,detail,status,first_seen_at,last_seen_at,acknowledged_by,acknowledged_at,resolved_at,source_json FROM continuous_assurance_escalations ORDER BY last_seen_at DESC LIMIT 2000").all<AssuranceEscalationRecord>()).results||[]}catch{return []}}

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const env=await runtime(),settings=await reminderConfig(env.DB),rawEscalations=await escalationRows(env.DB),escalations=await enrichAssuranceEscalationOwners(env.DB,rawEscalations);await ensureAssuranceNotificationSchema(env.DB);await syncAssuranceNotificationOutbox(env.DB,escalations,settings.remindersEnabled);
 const outbox=(await env.DB.prepare("SELECT * FROM continuous_assurance_notification_outbox ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,updated_at DESC LIMIT 1000").all<OutboxRow>()).results||[],now=new Date(),summary=buildExecutiveOperationsSummary(escalations,outbox,now),owners=buildOwnerAccountability(escalations,now);
 const open=escalations.filter(row=>row.status!=="resolved"),routes={owner:outbox.filter(row=>row.status==="queued"&&row.route==="in-app-owner").length,governance:outbox.filter(row=>row.status==="queued"&&row.route==="in-app-governance").length};
 return json({generatedAt:now.toISOString(),policy:settings,summary,routes,owners,escalations:open.slice(0,100).map(row=>({id:row.id,kind:row.kind,severity:row.severity,subjectRef:row.subject_ref,owner:row.owner,title:row.title,status:row.status,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at})),outbox:outbox.slice(0,100).map(row=>({id:row.id,escalationId:row.escalation_id,recipient:row.recipient,route:row.route,subject:row.subject,severity:row.severity,status:row.status,reason:row.reason,createdAt:row.created_at,updatedAt:row.updated_at}))});
}
