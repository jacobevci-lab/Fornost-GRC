import { alertFingerprint,assuranceAlertCandidates } from './assurance-alerts';
type Candidate=ReturnType<typeof assuranceAlertCandidates>[number];
/** A repeated snapshot is a no-op; observation and audit either both commit or neither does. */
export async function observeAiAlert(db:D1Database,row:Record<string,unknown>,candidate:Candidate,actor:string,now:string){
 const id=`AIAA-${crypto.randomUUID()}`,fingerprint=await alertFingerprint(String(row.model_id),String(row.id),candidate.metric);
 const results=await db.batch([
  db.prepare(`INSERT INTO ai_assurance_alerts(id,model_id,policy_id,monitoring_ref,metric,title,severity,observed_value,threshold_value,fingerprint,first_seen_at,last_seen_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?
   WHERE EXISTS(SELECT 1 FROM ai_assurance_policies p JOIN ai_model_inventory i ON i.id=p.model_id
    WHERE p.id=? AND p.model_id=? AND p.status='approved' AND p.review_date>=? AND p.updated_at=? AND i.status!='retired' AND i.risk_tier=?)
   AND (SELECT id FROM ai_model_monitoring WHERE model_id=? ORDER BY recorded_at DESC,id DESC LIMIT 1) IS ?
   ON CONFLICT(fingerprint) DO UPDATE SET monitoring_ref=excluded.monitoring_ref,title=excluded.title,severity=excluded.severity,
    observed_value=excluded.observed_value,threshold_value=excluded.threshold_value,occurrence_count=ai_assurance_alerts.occurrence_count+1,last_seen_at=excluded.last_seen_at
   WHERE ai_assurance_alerts.status!='resolved' AND ai_assurance_alerts.last_seen_at<=excluded.last_seen_at
    AND (ai_assurance_alerts.monitoring_ref IS NOT excluded.monitoring_ref OR ai_assurance_alerts.title IS NOT excluded.title
     OR ai_assurance_alerts.severity IS NOT excluded.severity OR ai_assurance_alerts.observed_value IS NOT excluded.observed_value
     OR ai_assurance_alerts.threshold_value IS NOT excluded.threshold_value)
   RETURNING id`)
   .bind(id,row.model_id,row.id,row.monitoring_ref||null,candidate.metric,candidate.title,candidate.severity,candidate.observed,candidate.threshold,fingerprint,now,now,row.id,row.model_id,now.slice(0,10),row.updated_at,row.risk_tier,row.model_id,row.monitoring_ref||null),
  db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
   SELECT ?,?,'ai-assurance-alert-observe','','',NULL,json_array(model_id,policy_id,id),'success',0,?,?
   FROM ai_assurance_alerts WHERE fingerprint=? AND changes()=1`)
   .bind(crypto.randomUUID(),actor,`${candidate.metric}; ${candidate.severity}; distinct observation`,now,fingerprint)
 ]);
 const written=results[0]?.results?.[0] as {id:string}|undefined;
 return !written?'unchanged':written.id===id?'created':'updated';
}
