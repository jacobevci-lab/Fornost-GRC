import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {clean} from "../../integrations/security";
import {exceptionExpirySeverity,riskReviewSeverity} from "../../../assurance-escalations";
import {riskReviewEscalation} from "../../../assurance-governance";

type Env=Record<string,unknown>&{DB:D1Database};
type EscalationRow={id:string;fingerprint:string;kind:string;severity:string;subject_ref:string;owner:string;title:string;detail:string;status:string;first_seen_at:string;last_seen_at:string;acknowledged_by:string|null;acknowledged_at:string|null;ack_note:string|null;resolved_by:string|null;resolved_at:string|null;source_json:string};
type Signal={fingerprint:string;kind:string;severity:"medium"|"high"|"critical";subjectRef:string;owner:string;title:string;detail:string;source:Record<string,unknown>};
const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_escalations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,severity TEXT NOT NULL,subject_ref TEXT NOT NULL,owner TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,acknowledged_by TEXT,acknowledged_at TEXT,ack_note TEXT,resolved_by TEXT,resolved_at TEXT,source_json TEXT NOT NULL DEFAULT '{}')`,
 `CREATE INDEX IF NOT EXISTS ca_escalations_status_idx ON continuous_assurance_escalations(status,severity,last_seen_at)`,
 `CREATE INDEX IF NOT EXISTS ca_escalations_subject_idx ON continuous_assurance_escalations(subject_ref,kind,status)`,
];
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
async function ready(db:D1Database){for(const sql of schema)await db.prepare(sql).run()}
async function reminderConfig(db:D1Database){let reminderDays=15,remindersEnabled=true;try{const row=await db.prepare("SELECT config_json FROM platform_settings WHERE id='default'").first<{config_json:string}>();if(row){const value=parse(row.config_json),days=Number(value.reminderDays);if(Number.isInteger(days)&&days>=1&&days<=365)reminderDays=days;if(value.remindersEnabled===false)remindersEnabled=false}}catch{}return{reminderDays,remindersEnabled}}
async function upsert(db:D1Database,signal:Signal,stamp:string){
 const id=`CAE-${crypto.randomUUID()}`;
 await db.prepare(`INSERT INTO continuous_assurance_escalations(id,fingerprint,kind,severity,subject_ref,owner,title,detail,status,first_seen_at,last_seen_at,source_json) VALUES(?,?,?,?,?,?,?,?,'active',?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET kind=excluded.kind,severity=excluded.severity,subject_ref=excluded.subject_ref,owner=excluded.owner,title=excluded.title,detail=excluded.detail,last_seen_at=excluded.last_seen_at,source_json=excluded.source_json,status=CASE WHEN continuous_assurance_escalations.status='resolved' THEN 'active' ELSE continuous_assurance_escalations.status END,resolved_by=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.resolved_by END,resolved_at=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.resolved_at END`).bind(id,signal.fingerprint,signal.kind,signal.severity,signal.subjectRef,signal.owner,signal.title,signal.detail,stamp,stamp,JSON.stringify(signal.source)).run();
}
async function reconcile(db:D1Database,now=new Date()){
 const stamp=now.toISOString(),today=stamp.slice(0,10),settings=await reminderConfig(db),signals:Signal[]=[];
 try{
  const rows=await db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Risk Assessment' ORDER BY updated_at DESC LIMIT 2000").all<{id:string;data_json:string;updated_at:string}>();
  for(const row of rows.results){const data=parse(row.data_json);if(data.residualRiskReviewRequired!==true)continue;const requestedAt=String(data.riskReviewRequestedAt||data.lastReassessedAt||row.updated_at||""),aging=riskReviewEscalation(true,requestedAt,now),severity=riskReviewSeverity(aging.state);if(!severity||(!settings.remindersEnabled&&aging.state==="due-soon"))continue;signals.push({fingerprint:`risk-review:${row.id}`,kind:"risk-review",severity,subjectRef:row.id,owner:String(data.owner||""),title:`Residual risk review ${aging.state}`,detail:`${String(data.title||row.id)} · ${aging.ageDays} day(s) waiting for risk-owner reassessment.`,source:{riskId:row.id,urgency:aging.state,ageDays:aging.ageDays,requestedAt}})}
 }catch{}
 try{
  const rows=await db.prepare("SELECT id,finding_id,rule_id,control_ref,risk_ref,expires_at,status FROM continuous_assurance_exceptions WHERE status='active' ORDER BY expires_at LIMIT 1000").all<{id:string;finding_id:string;rule_id:string;control_ref:string;risk_ref:string;expires_at:string;status:string}>();
  if(settings.remindersEnabled)for(const row of rows.results){const severity=exceptionExpirySeverity(row.expires_at,today,settings.reminderDays);if(!severity)continue;signals.push({fingerprint:`exception-expiry:${row.id}`,kind:"exception-expiry",severity,subjectRef:row.id,owner:"",title:"Assurance exception approaching expiry",detail:`${row.control_ref||row.rule_id||row.risk_ref||row.finding_id||row.id} expires ${row.expires_at}.`,source:{exceptionId:row.id,expiresAt:row.expires_at,controlRef:row.control_ref,riskRef:row.risk_ref}})}
 }catch{}
 try{
  const rows=await db.prepare("SELECT id,finding_id,rule_id,status,decision_json,updated_at,result_ref FROM continuous_assurance_work_items WHERE (action='control-retest' AND status IN ('pending-review','approved-awaiting-retest','failed-retest','retest-error')) ORDER BY updated_at DESC LIMIT 1000").all<{id:string;finding_id:string;rule_id:string;status:string;decision_json:string;updated_at:string;result_ref:string|null}>();
  for(const row of rows.results){const decision=parse(row.decision_json),fromException=decision.source==="assurance-exception",failed=row.status==="failed-retest"||row.status==="retest-error";if(!fromException&&!failed)continue;const severity=failed?"critical":"high",kind=failed?"retest-failure":"mandatory-retest",subjectRef=String(decision.exceptionId||row.finding_id||row.id),title=failed?"Continuous Assurance re-test failed":"Mandatory control re-test pending",detail=failed?`${row.finding_id} · ${row.rule_id} · ${row.status}`:`Exception ${String(decision.exceptionId||"")} requires control re-test · ${row.status}.`;signals.push({fingerprint:`${kind}:${fromException?String(decision.exceptionId||row.id):row.id}`,kind,severity,subjectRef,owner:"",title,detail,source:{workItemId:row.id,findingId:row.finding_id,ruleId:row.rule_id,status:row.status,resultRef:row.result_ref||"",exceptionId:String(decision.exceptionId||"")}})}
 }catch{}
 const active=new Set(signals.map(signal=>signal.fingerprint));for(const signal of signals)await upsert(db,signal,stamp);
 const existing=await db.prepare("SELECT id,fingerprint,status FROM continuous_assurance_escalations WHERE status IN ('active','acknowledged') LIMIT 2000").all<{id:string;fingerprint:string;status:string}>();
 for(const row of existing.results)if(!active.has(row.fingerprint))await db.prepare("UPDATE continuous_assurance_escalations SET status='resolved',resolved_by='system:condition-cleared',resolved_at=?,last_seen_at=? WHERE id=? AND status IN ('active','acknowledged')").bind(stamp,stamp,row.id).run();
 return{signals:signals.length,...settings};
}
const publicRow=(row:EscalationRow)=>({id:row.id,fingerprint:row.fingerprint,kind:row.kind,severity:row.severity,subjectRef:row.subject_ref,owner:row.owner,title:row.title,detail:row.detail,status:row.status,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,acknowledgedBy:row.acknowledged_by||"",acknowledgedAt:row.acknowledged_at||"",ackNote:row.ack_note||"",resolvedBy:row.resolved_by||"",resolvedAt:row.resolved_at||"",source:parse(row.source_json)});

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
 const env=await runtime();await ready(env.DB);const policy=await reconcile(env.DB),cutoff=new Date(Date.now()-30*86_400_000).toISOString();
 const rows=await env.DB.prepare("SELECT * FROM continuous_assurance_escalations ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,last_seen_at DESC LIMIT 500").all<EscalationRow>(),records=rows.results.map(publicRow),open=records.filter(item=>item.status!=="resolved");
 return json({records,policy,summary:{active:open.filter(item=>item.status==="active").length,acknowledged:open.filter(item=>item.status==="acknowledged").length,critical:open.filter(item=>item.severity==="critical").length,high:open.filter(item=>item.severity==="high").length,medium:open.filter(item=>item.severity==="medium").length,resolved30d:records.filter(item=>item.status==="resolved"&&item.resolvedAt>=cutoff).length}});
}

export async function POST(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor"]);if(access.response)return access.response;
 if(Number(req.headers.get("content-length")||0)>32_768)return json({error:"İstek boyutu çok büyük."},413);
 const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,40),id=clean(body.id,120),note=clean(body.note,1200);if(action!=="acknowledge"||!id)return json({error:"Geçersiz escalation işlemi."},400);if(note.length<10)return json({error:"Acknowledgement notu en az 10 karakter olmalıdır."},400);
 const env=await runtime();await ready(env.DB);await reconcile(env.DB);const row=await env.DB.prepare("SELECT * FROM continuous_assurance_escalations WHERE id=?").bind(id).first<EscalationRow>();if(!row)return json({error:"Escalation bulunamadı."},404);if(row.status!=="active")return json({error:"Yalnız aktif escalation acknowledge edilebilir."},409);const stamp=new Date().toISOString();await env.DB.prepare("UPDATE continuous_assurance_escalations SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,ack_note=?,last_seen_at=? WHERE id=? AND status='active'").bind(access.actor.email,stamp,note,stamp,id).run();return json({ok:true,status:"acknowledged",acknowledgedBy:access.actor.email,acknowledgedAt:stamp});
}
