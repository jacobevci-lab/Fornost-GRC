import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {clean} from "../../integrations/security";
import {assuranceAlertEscalation,buildAssuranceAlertSignals,type AssuranceAlertSeverity} from "../../../assurance-alerts";

type Env=Record<string,unknown>&{DB:D1Database};
type AlertRow={id:string;fingerprint:string;alert_type:string;ref_type:string;ref_id:string;severity:AssuranceAlertSeverity;title:string;detail:string;status:string;first_seen_at:string;last_seen_at:string;acknowledged_by:string|null;acknowledged_at:string|null;acknowledgement_note:string|null;resolved_at:string|null;occurrence_count:number};
const schema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_alerts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,alert_type TEXT NOT NULL,ref_type TEXT NOT NULL,ref_id TEXT NOT NULL,severity TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,acknowledged_by TEXT,acknowledged_at TEXT,acknowledgement_note TEXT,resolved_at TEXT,occurrence_count INTEGER NOT NULL DEFAULT 1)`,
 `CREATE INDEX IF NOT EXISTS ca_alerts_status_severity_idx ON continuous_assurance_alerts(status,severity,last_seen_at)`,
 `CREATE TABLE IF NOT EXISTS continuous_assurance_alert_events(id TEXT PRIMARY KEY,alert_id TEXT NOT NULL,action TEXT NOT NULL,from_status TEXT,to_status TEXT,actor TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS ca_alert_events_alert_date_idx ON continuous_assurance_alert_events(alert_id,created_at)`,
];
async function runtime(){const{env}=await import("cloudflare:workers");return env as unknown as Env}
async function ready(db:D1Database){for(const sql of schema)await db.prepare(sql).run()}
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};
async function safeRows<T>(db:D1Database,sql:string){try{return(await db.prepare(sql).all<T>()).results}catch{return[] as T[]}}
async function event(db:D1Database,input:{alertId:string;action:string;from?:string;to?:string;actor:string;note?:string;at:string}){await db.prepare("INSERT INTO continuous_assurance_alert_events(id,alert_id,action,from_status,to_status,actor,note,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),input.alertId,input.action,input.from||null,input.to||null,input.actor,input.note||"",input.at).run()}

async function liveSignals(db:D1Database,now:Date){
 const [workRows,exceptionRows,riskRows,findingRows]=await Promise.all([
  safeRows<Record<string,unknown>>(db,"SELECT w.id,w.action,w.status,w.created_at,w.updated_at,w.reviewed_at,w.completed_at,w.rule_id,f.title finding_title,f.severity FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id WHERE w.status IN ('pending-review','approved-awaiting-retest','failed-retest','retest-error') LIMIT 1000"),
  safeRows<Record<string,unknown>>(db,"SELECT id,status,expires_at,control_ref,rule_id,risk_ref,finding_id FROM continuous_assurance_exceptions WHERE status IN ('pending-review','active') LIMIT 1000"),
  safeRows<Record<string,unknown>>(db,"SELECT id,data_json FROM simple_grc_records WHERE module='Risk Assessment' LIMIT 3000"),
  safeRows<Record<string,unknown>>(db,"SELECT id,title,severity,status,due_date,rule_id FROM evidence_automation_findings WHERE status!='closed' LIMIT 2000"),
 ]);
 const workItems=workRows.map(row=>({id:String(row.id||""),action:String(row.action||""),status:String(row.status||""),createdAt:String(row.created_at||""),updatedAt:String(row.updated_at||""),reviewedAt:String(row.reviewed_at||""),completedAt:String(row.completed_at||""),severity:String(row.severity||"medium"),findingTitle:String(row.finding_title||""),ruleId:String(row.rule_id||"")}));
 const exceptions=exceptionRows.map(row=>({id:String(row.id||""),status:String(row.status||""),expiresAt:String(row.expires_at||""),controlRef:String(row.control_ref||""),ruleId:String(row.rule_id||""),riskRef:String(row.risk_ref||""),findingId:String(row.finding_id||"")}));
 const risks=riskRows.map(row=>{const data=parse(String(row.data_json||"{}"));return{id:String(row.id||""),title:String(data.title||row.id||""),owner:String(data.owner||""),residualRiskReviewRequired:data.residualRiskReviewRequired===true,assuranceState:String(data.assuranceState||"")}});
 const findings=findingRows.map(row=>({id:String(row.id||""),title:String(row.title||""),severity:String(row.severity||""),status:String(row.status||""),dueDate:String(row.due_date||""),ruleId:String(row.rule_id||"")}));
 return buildAssuranceAlertSignals({workItems,exceptions,risks,findings},now);
}

async function syncAlerts(db:D1Database,now=new Date()){
 await ready(db);const at=now.toISOString(),signals=await liveSignals(db,now),live=new Set(signals.map(signal=>signal.fingerprint));
 for(const signal of signals){
  const existing=await db.prepare("SELECT * FROM continuous_assurance_alerts WHERE fingerprint=?").bind(signal.fingerprint).first<AlertRow>();
  if(!existing){const id=`CAA-${crypto.randomUUID()}`;await db.prepare("INSERT INTO continuous_assurance_alerts(id,fingerprint,alert_type,ref_type,ref_id,severity,title,detail,status,first_seen_at,last_seen_at,occurrence_count) VALUES(?,?,?,?,?,?,?,?,'open',?,?,1)").bind(id,signal.fingerprint,signal.type,signal.refType,signal.refId,signal.severity,signal.title,signal.detail,at,at).run();await event(db,{alertId:id,action:"detected",to:"open",actor:"system:continuous-assurance",note:signal.detail,at});continue}
  if(existing.status==="resolved"){await db.prepare("UPDATE continuous_assurance_alerts SET severity=?,title=?,detail=?,status='open',last_seen_at=?,acknowledged_by=NULL,acknowledged_at=NULL,acknowledgement_note=NULL,resolved_at=NULL,occurrence_count=occurrence_count+1 WHERE id=?").bind(signal.severity,signal.title,signal.detail,at,existing.id).run();await event(db,{alertId:existing.id,action:"reopened",from:"resolved",to:"open",actor:"system:continuous-assurance",note:signal.detail,at});continue}
  await db.prepare("UPDATE continuous_assurance_alerts SET severity=?,title=?,detail=?,last_seen_at=? WHERE id=?").bind(signal.severity,signal.title,signal.detail,at,existing.id).run();
 }
 const active=await db.prepare("SELECT * FROM continuous_assurance_alerts WHERE status IN ('open','acknowledged') LIMIT 2000").all<AlertRow>();
 for(const alert of active.results){if(live.has(alert.fingerprint))continue;await db.prepare("UPDATE continuous_assurance_alerts SET status='resolved',resolved_at=?,last_seen_at=? WHERE id=? AND status IN ('open','acknowledged')").bind(at,at,alert.id).run();await event(db,{alertId:alert.id,action:"auto-resolved",from:alert.status,to:"resolved",actor:"system:continuous-assurance",note:"Underlying Continuous Assurance condition cleared.",at})}
 return signals.length;
}

export async function GET(req:NextRequest){
 const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;const env=await runtime(),now=new Date();await syncAlerts(env.DB,now);
 const result=await env.DB.prepare("SELECT * FROM continuous_assurance_alerts ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,last_seen_at DESC LIMIT 500").all<AlertRow>();
 const alerts=result.results.map(row=>({id:row.id,type:row.alert_type,refType:row.ref_type,refId:row.ref_id,severity:row.severity,title:row.title,detail:row.detail,status:row.status,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,acknowledgedBy:row.acknowledged_by||"",acknowledgedAt:row.acknowledged_at||"",acknowledgementNote:row.acknowledgement_note||"",resolvedAt:row.resolved_at||"",occurrenceCount:Number(row.occurrence_count||1),escalation:assuranceAlertEscalation(row.severity,row.first_seen_at,now)}));
 const active=alerts.filter(item=>item.status!=="resolved");return json({alerts,summary:{active:active.length,unacknowledged:active.filter(item=>item.status==="open").length,critical:active.filter(item=>item.severity==="critical").length,high:active.filter(item=>item.severity==="high").length,escalated:active.filter(item=>item.escalation==="management"||item.escalation==="executive").length,resolved:alerts.filter(item=>item.status==="resolved").length}});
}

export async function POST(req:NextRequest){
 if(Number(req.headers.get("content-length")||0)>32_768)return json({error:"İstek boyutu çok büyük."},413);const access=await requireRole(req,["Admin","Editor"]);if(access.response)return access.response;const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=clean(body.action,40);if(action!=="acknowledge-alert")return json({error:"Geçersiz alert işlemi."},400);
 const id=clean(body.alertId,120),note=clean(body.note,1000);if(!id||note.length<5)return json({error:"Alert referansı ve en az 5 karakter acknowledgement notu zorunludur."},400);const env=await runtime();await ready(env.DB);const alert=await env.DB.prepare("SELECT * FROM continuous_assurance_alerts WHERE id=?").bind(id).first<AlertRow>();if(!alert)return json({error:"Alert bulunamadı."},404);if(alert.status==="resolved")return json({error:"Çözülmüş alert acknowledge edilemez."},409);if(alert.status==="acknowledged")return json({ok:true,status:"acknowledged",message:"Alert zaten acknowledge edilmiş."});const at=new Date().toISOString();await env.DB.prepare("UPDATE continuous_assurance_alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,acknowledgement_note=?,last_seen_at=? WHERE id=? AND status='open'").bind(access.actor.email,at,note,at,id).run();await event(env.DB,{alertId:id,action:"acknowledged",from:"open",to:"acknowledged",actor:access.actor.email,note,at});return json({ok:true,status:"acknowledged",message:"Alert acknowledge edildi; underlying koşul düzelene kadar aktif kalacak."});
}
