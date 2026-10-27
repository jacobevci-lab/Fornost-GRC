/** Metadata-only inbox read. Authorization remains at the continuity route boundary. */
export const CONTINUITY_WORK_LIMIT = 2000;
export async function readContinuityWork(db: D1Database) {
  const limit = CONTINUITY_WORK_LIMIT + 1;
  const [plans, exercises, gaps] = await Promise.all([
    db.prepare(`SELECT id,code,name,status,owner,reviewer,crisis_lead crisisLead,
      review_date reviewDate,criticality,updated_at updatedAt,retired_at completedAt
      FROM enterprise_continuity_plans ORDER BY CASE WHEN status='retired' THEN 1 ELSE 0 END,review_date,id LIMIT ?`).bind(limit).all(),
    db.prepare(`SELECT e.id,e.code,e.plan_id planId,e.type,e.status,e.facilitator,
      e.scheduled_date scheduledDate,e.created_at createdAt,
      CASE WHEN e.status='cancelled' THEN (SELECT MAX(v.created_at) FROM enterprise_continuity_events v
        WHERE v.entity_type='exercise' AND v.entity_id=e.id AND v.action='cancel')
        ELSE e.completed_at END completedAt
      FROM enterprise_continuity_exercises e ORDER BY CASE WHEN e.status='planned' THEN 0 ELSE 1 END,e.scheduled_date,e.id LIMIT ?`).bind(limit).all(),
    db.prepare(`SELECT id,plan_id planId,exercise_id exerciseId,title,status,owner,reviewer,
      due_date dueDate,severity,created_at createdAt,closed_at completedAt
      FROM enterprise_continuity_gaps ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END,due_date,id LIMIT ?`).bind(limit).all(),
  ]);
  return {
    plans: plans.results.slice(0, CONTINUITY_WORK_LIMIT),
    exercises: exercises.results.slice(0, CONTINUITY_WORK_LIMIT),
    gaps: gaps.results.slice(0, CONTINUITY_WORK_LIMIT),
    complete: [plans, exercises, gaps].every(result => result.results.length <= CONTINUITY_WORK_LIMIT),
  };
}
