async function readRows<T>(db:D1Database){
  const order="ORDER BY CASE w.status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END,w.updated_at DESC,w.id ASC LIMIT 501";
  try{
    return await db.prepare(`SELECT w.*,f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs,ef.code result_code FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id LEFT JOIN enterprise_findings ef ON ef.id=w.result_ref ${order}`).all<T>();
  }catch{
    try{
      return await db.prepare(`SELECT w.*,f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id ${order}`).all<T>();
    }catch{
      return db.prepare("SELECT * FROM continuous_assurance_work_items ORDER BY CASE status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END,updated_at DESC,id ASC LIMIT 501").all<T>();
    }
  }
}

export const ASSURANCE_QUEUE_LIMIT = 500;
export async function readAssuranceQueue<T>(db:D1Database) {
  const result=await readRows<T>(db);
  const rows=result.results.slice(0,ASSURANCE_QUEUE_LIMIT);
  return {rows,coverage:{loaded:rows.length,complete:result.results.length<=ASSURANCE_QUEUE_LIMIT}};
}
