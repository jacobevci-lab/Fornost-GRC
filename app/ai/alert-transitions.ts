import { validateAlertAction } from './assurance-alerts';
// Bind the displayed decision and measurements, without a schema migration.
const snapshotFields = ['id', 'model_id', 'policy_id', 'monitoring_ref', 'metric', 'title', 'severity', 'observed_value', 'threshold_value', 'fingerprint', 'occurrence_count', 'status', 'owner', 'action_note', 'finding_id', 'first_seen_at', 'last_seen_at', 'acknowledged_by', 'acknowledged_at', 'escalated_by', 'escalated_at', 'resolved_by', 'resolved_at', 'reopened_by', 'reopened_at'] as const;
export async function aiAlertRevision(row:Record<string,unknown>){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshotFields.map(field=>row[field]??null))));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function transitionAiAlert(db:D1Database,id:string,input:Record<string,unknown>,actor:string){
 const action=validateAlertAction(input),row=await db.prepare('SELECT * FROM ai_assurance_alerts WHERE id=?').bind(id).first<Record<string,unknown>>();
 if(!row)return {code:404,error:'Güvence alarmı bulunamadı.'};
 if(!input.expectedRevision||input.expectedRevision!==await aiAlertRevision(row))return {code:409,error:'Alarm veya ölçüm değişti. Güncel kaydı inceleyip işlemi yeniden açın.'};
const transitions:Record<string,Record<string,string>>={open:{acknowledge:"acknowledged",escalate:"escalated"},acknowledged:{escalate:"escalated",resolve:"resolved"},escalated:{resolve:"resolved"},resolved:{reopen:"open"}},next=transitions[String(row.status)]?.[action.action];if(!next)return {code:409,error:`${action.action} işlemi ${row.status} durumundan uygulanamaz.`};
 const times=['first_seen_at','last_seen_at','acknowledged_at','escalated_at','resolved_at','reopened_at'].map(key=>Date.parse(String(row[key]||''))).filter(Number.isFinite);
 const now=new Date(Math.max(Date.now(),...times.map(t=>t+1))).toISOString();
 let findingId=row.finding_id;
 if(action.action==='escalate'){
  if(!['High','Critical'].includes(String(row.severity)))return {code:409,error:"Yalnız yüksek veya kritik alarm CAPA'ya dönüştürülebilir."};
  if(findingId)return {code:409,error:'Bu alarm zaten bir CAPA kaydına bağlı.'};
  findingId=`AIF-${crypto.randomUUID()}`;
 }
 const guard=snapshotFields.map(field=>`${field} IS ?`).join(' AND ')+(action.action==='escalate'?" AND NOT EXISTS(SELECT 1 FROM ai_findings WHERE model_id=? AND domain='assurance' AND source_ref=? AND status!='resolved')":'');
 const statements=[db.prepare(`UPDATE ai_assurance_alerts SET status=?,owner=COALESCE(NULLIF(?,''),owner),action_note=?,finding_id=?,acknowledged_by=CASE WHEN ?='acknowledge' THEN ? ELSE acknowledged_by END,acknowledged_at=CASE WHEN ?='acknowledge' THEN ? ELSE acknowledged_at END,escalated_by=CASE WHEN ?='escalate' THEN ? ELSE escalated_by END,escalated_at=CASE WHEN ?='escalate' THEN ? ELSE escalated_at END,resolved_by=CASE WHEN ?='resolve' THEN ? ELSE resolved_by END,resolved_at=CASE WHEN ?='resolve' THEN ? ELSE resolved_at END,reopened_by=CASE WHEN ?='reopen' THEN ? ELSE reopened_by END,reopened_at=CASE WHEN ?='reopen' THEN ? ELSE reopened_at END WHERE ${guard}`).bind(next,action.owner,action.note,findingId,action.action,actor,action.action,now,action.action,actor,action.action,now,action.action,actor,action.action,now,action.action,actor,action.action,now,...snapshotFields.map(field=>row[field]??null),...(action.action==='escalate'?[row.model_id,id]:[]))];
 if(action.action==='escalate'){const due=new Date(now);due.setUTCDate(due.getUTCDate()+(row.severity==='Critical'?7:30));statements.push(db.prepare("INSERT INTO ai_findings(id,model_id,domain,source_ref,title,description,root_cause,corrective_action,preventive_action,owner,severity,due_date,status,created_by,created_at,updated_by,updated_at) SELECT ?,?,'assurance',?,?,?,?,?,?,?,?,?,'open',?,?,?,? WHERE changes()=1").bind(findingId,row.model_id,id,`Güvence alarmı: ${row.title}`,`Baseline ihlali ${row.metric} metriğinde deterministik güvence alarmı üretti.`,`Kök neden CAPA incelemesinde ölçüm, veri ve model değişiklikleriyle doğrulanmalıdır.`,`İhlali giderin ve onaylı baseline ölçümünü kanıt referansı ile yeniden çalıştırın.`,`Aynı ihlal için erken uyarı, sorumlu eskalasyonu ve release gate kontrolünü sürdürün.`,action.owner||row.owner||actor,row.severity,due.toISOString().slice(0,10),actor,now,actor,now));}
 // D1 batch is transactional; dependent writes only follow a successful claim.
 statements.push(db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
 SELECT ?,?,?,'','',NULL,?,'success',0,?,? WHERE changes()=1`).bind(crypto.randomUUID(),actor,`ai-assurance-alert-${action.action}`,JSON.stringify([row.model_id,id,findingId].filter(Boolean)),`${row.severity}; ${row.status}->${next}; deterministic alert lifecycle`,now));
 const results=await db.batch(statements);
 if(Number(results[0]?.meta?.changes||0)!==1)return {code:409,error:'Alarm veya ölçüm değişti. Güncel kaydı inceleyip tekrar deneyin.'};
 return {code:200,status:next,findingId};
}
