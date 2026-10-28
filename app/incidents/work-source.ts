/** Queue metadata only. The incident route retains authentication and enterprise access checks. */
export const INCIDENT_WORK_LIMIT = 2000;

export async function readIncidentWork(db: D1Database) {
  const result = await db.prepare(`SELECT id,code,title,status,severity,owner,commander,reviewer,
    declared_at createdAt,updated_at updatedAt,closed_at completedAt
    FROM enterprise_incidents
    ORDER BY CASE WHEN status='closed' THEN 1 ELSE 0 END,
      CASE WHEN status='closed' THEN closed_at END DESC,
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      declared_at DESC,id
    LIMIT ?`).bind(INCIDENT_WORK_LIMIT + 1).all();
  return { incidents: result.results.slice(0, INCIDENT_WORK_LIMIT), complete: result.results.length <= INCIDENT_WORK_LIMIT };
}
