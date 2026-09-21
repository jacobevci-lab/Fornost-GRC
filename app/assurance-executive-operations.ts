export type AssuranceEscalationRecord={
 id:string;kind:string;severity:"medium"|"high"|"critical"|string;subject_ref:string;owner:string;title:string;detail:string;status:string;first_seen_at:string;last_seen_at:string;acknowledged_by?:string|null;acknowledged_at?:string|null;resolved_at?:string|null;source_json?:string;
};
export type AssuranceNotificationRoute={route:"in-app-owner"|"in-app-governance";recipient:string;reason:string};

const open=(row:AssuranceEscalationRecord)=>row.status!=="resolved";
const ageDays=(iso:string,now:Date)=>{const stamp=new Date(iso).getTime();return Number.isFinite(stamp)?Math.max(0,Math.floor((now.getTime()-stamp)/86_400_000)):0};
const parse=(value:unknown)=>{try{return JSON.parse(String(value||"{}")) as Record<string,unknown>}catch{return {}}};

export async function enrichAssuranceEscalationOwners(db:D1Database,rows:AssuranceEscalationRecord[]){
 const riskOwners=new Map<string,string>(),exceptionRisks=new Map<string,string>(),findingRisks=new Map<string,string>();
 try{const risks=(await db.prepare("SELECT id,data_json FROM simple_grc_records WHERE module='Risk Assessment' LIMIT 5000").all<{id:string;data_json:string}>()).results||[];for(const row of risks){const data=parse(row.data_json),owner=String(data.owner||"").trim();if(owner)riskOwners.set(row.id,owner)}}catch{}
 try{const exceptions=(await db.prepare("SELECT id,risk_ref FROM continuous_assurance_exceptions LIMIT 3000").all<{id:string;risk_ref:string}>()).results||[];for(const row of exceptions)if(row.risk_ref)exceptionRisks.set(row.id,row.risk_ref)}catch{}
 try{const findings=(await db.prepare("SELECT id,risk_ref FROM enterprise_findings LIMIT 5000").all<{id:string;risk_ref:string}>()).results||[];for(const row of findings)if(row.risk_ref)findingRisks.set(row.id,row.risk_ref)}catch{}
 return rows.map(row=>{
  if(String(row.owner||"").trim())return row;
  const source=parse(row.source_json),exceptionId=String(source.exceptionId||""),findingId=String(source.findingId||""),riskRef=String(source.riskId||source.riskRef||exceptionRisks.get(exceptionId||row.subject_ref)||findingRisks.get(findingId||row.subject_ref)||"");
  return riskRef&&riskOwners.get(riskRef)?{...row,owner:riskOwners.get(riskRef)!}:row;
 });
}

export function notificationRoutes(row:AssuranceEscalationRecord,remindersEnabled=true):AssuranceNotificationRoute[]{
 if(row.status!=="active")return [];
 if(row.severity==="medium"&&!remindersEnabled)return [];
 const owner=String(row.owner||"").trim(),routes:AssuranceNotificationRoute[]=[];
 if(owner)routes.push({route:"in-app-owner",recipient:owner,reason:"accountable-owner"});
 if(!owner||row.severity==="critical")routes.push({route:"in-app-governance",recipient:"",reason:owner?"critical-governance-escalation":"owner-unassigned"});
 return routes;
}

export function buildOwnerAccountability(rows:AssuranceEscalationRecord[],now=new Date()){
 const grouped=new Map<string,{owner:string;assigned:boolean;open:number;critical:number;high:number;unacknowledged:number;oldestAgeDays:number;kinds:Set<string>}>();
 for(const row of rows.filter(open)){
  const owner=String(row.owner||"").trim()||"Unassigned",current=grouped.get(owner)||{owner,assigned:owner!=="Unassigned",open:0,critical:0,high:0,unacknowledged:0,oldestAgeDays:0,kinds:new Set<string>()};
  current.open+=1;if(row.severity==="critical")current.critical+=1;if(row.severity==="high")current.high+=1;if(row.status==="active")current.unacknowledged+=1;current.oldestAgeDays=Math.max(current.oldestAgeDays,ageDays(row.first_seen_at,now));current.kinds.add(row.kind);grouped.set(owner,current);
 }
 return [...grouped.values()].map(item=>({...item,kinds:[...item.kinds].sort()})).sort((a,b)=>b.critical-a.critical||b.high-a.high||b.unacknowledged-a.unacknowledged||b.oldestAgeDays-a.oldestAgeDays||a.owner.localeCompare(b.owner));
}

export function buildExecutiveOperationsSummary(rows:AssuranceEscalationRecord[],outbox:{status:string}[]=[],now=new Date()){
 const current=rows.filter(open),assigned=current.filter(row=>String(row.owner||"").trim()).length;
 return {
  openEscalations:current.length,
  critical:current.filter(row=>row.severity==="critical").length,
  high:current.filter(row=>row.severity==="high").length,
  unacknowledged:current.filter(row=>row.status==="active").length,
  ownerless:current.length-assigned,
  ownerCoverage:current.length?Math.round(assigned/current.length*100):100,
  overdueRiskReviews:current.filter(row=>row.kind==="risk-review"&&(row.severity==="high"||row.severity==="critical")).length,
  mandatoryRetests:current.filter(row=>row.kind==="mandatory-retest").length,
  retestFailures:current.filter(row=>row.kind==="retest-failure").length,
  oldestOpenAgeDays:current.reduce((max,row)=>Math.max(max,ageDays(row.first_seen_at,now)),0),
  queuedNotifications:outbox.filter(item=>item.status==="queued").length,
  acknowledgedNotifications:outbox.filter(item=>item.status==="acknowledged").length,
  cancelledNotifications:outbox.filter(item=>item.status==="cancelled").length,
 };
}

export const assuranceNotificationSchema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_notification_outbox (id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,escalation_id TEXT NOT NULL,recipient TEXT NOT NULL,route TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_routed_at TEXT NOT NULL,closed_at TEXT,source_json TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS assurance_notification_status_idx ON continuous_assurance_notification_outbox(status,updated_at)`,
 `CREATE INDEX IF NOT EXISTS assurance_notification_escalation_idx ON continuous_assurance_notification_outbox(escalation_id,status)`,
];

export async function ensureAssuranceNotificationSchema(db:D1Database){for(const sql of assuranceNotificationSchema)await db.prepare(sql).run()}

export async function syncAssuranceNotificationOutbox(db:D1Database,rows:AssuranceEscalationRecord[],remindersEnabled=true,now=new Date()){
 await ensureAssuranceNotificationSchema(db);const stamp=now.toISOString(),activeFingerprints:string[]=[];
 for(const row of rows){
  if(row.status==="acknowledged")await db.prepare("UPDATE continuous_assurance_notification_outbox SET status='acknowledged',updated_at=?,closed_at=? WHERE escalation_id=? AND status='queued'").bind(stamp,stamp,row.id).run();
  if(row.status==="resolved")await db.prepare("UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE escalation_id=? AND status='queued'").bind(stamp,stamp,row.id).run();
  for(const target of notificationRoutes(row,remindersEnabled)){
   const fingerprint=`${row.id}:${target.route}:${target.recipient||"governance"}`,id=`AON-${await shortDigest(fingerprint)}`;activeFingerprints.push(fingerprint);
   await db.prepare("INSERT INTO continuous_assurance_notification_outbox(id,fingerprint,escalation_id,recipient,route,subject,body,severity,status,reason,created_at,updated_at,last_routed_at,closed_at,source_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET recipient=excluded.recipient,route=excluded.route,subject=excluded.subject,body=excluded.body,severity=excluded.severity,status=CASE WHEN continuous_assurance_notification_outbox.status IN ('acknowledged','cancelled') THEN 'queued' ELSE continuous_assurance_notification_outbox.status END,reason=excluded.reason,updated_at=excluded.updated_at,last_routed_at=excluded.last_routed_at,closed_at=CASE WHEN continuous_assurance_notification_outbox.status IN ('acknowledged','cancelled') THEN NULL ELSE continuous_assurance_notification_outbox.closed_at END,source_json=excluded.source_json").bind(id,fingerprint,row.id,target.recipient,target.route,row.title,row.detail,row.severity,"queued",target.reason,stamp,stamp,stamp,null,JSON.stringify({kind:row.kind,subjectRef:row.subject_ref,escalationStatus:row.status})).run();
  }
 }
 const queued=(await db.prepare("SELECT id,fingerprint,escalation_id FROM continuous_assurance_notification_outbox WHERE status='queued'").all<{id:string;fingerprint:string;escalation_id:string}>()).results||[];
 const valid=new Set(activeFingerprints);for(const item of queued)if(!valid.has(item.fingerprint))await db.prepare("UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE id=? AND status='queued'").bind(stamp,stamp,item.id).run();
}

async function shortDigest(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(hash)).slice(0,10).map(byte=>byte.toString(16).padStart(2,"0")).join("").toUpperCase()}
