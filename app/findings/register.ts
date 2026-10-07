export const FINDING_REGISTER_LIMIT = 3000;
/** Counts cover the canonical register, including records outside the bounded UI list. */
export async function readFindingRegister(db: D1Database, day = new Date().toISOString().slice(0,10)) {
 const [rows, counts] = await db.batch([
  db.prepare("SELECT * FROM enterprise_findings ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_date,updated_at DESC,id LIMIT ?").bind(FINDING_REGISTER_LIMIT),
  db.prepare(`SELECT COUNT(*) total,
   COALESCE(SUM(status NOT IN ('closed','accepted')),0) open,
   COALESCE(SUM(severity='critical' AND status!='closed'),0) critical,
   COALESCE(SUM((status NOT IN ('closed','accepted') AND due_date<?) OR (status='accepted' AND accept_until IS NOT NULL AND accept_until!='' AND accept_until<?)),0) overdue,
   COALESCE(SUM(status='verification'),0) verification,
   COALESCE(SUM(status='accepted'),0) accepted,
   COALESCE(SUM(status='closed'),0) closed,
   COALESCE(SUM(recurrence_count>0),0) recurring FROM enterprise_findings`).bind(day,day),
 ]);
 const summary=counts.results[0] as Record<string,number>;
 return {rows:rows.results as Record<string,unknown>[],summary,coverage:{loaded:rows.results.length,total:summary.total,truncated:summary.total>rows.results.length}};
}
