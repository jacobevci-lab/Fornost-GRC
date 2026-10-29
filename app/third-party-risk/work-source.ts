/** Metadata-only inbox read; the existing TPRM route retains authorization. */
export const TPRM_WORK_LIMIT = 2000;
export async function readThirdPartyWork(db: D1Database) {
  const [profiles, assessments, findings] = await Promise.all([
    db.prepare(`SELECT p.vendor_id vendorId,p.name,p.status,p.criticality,
      p.business_owner businessOwner,p.risk_owner riskOwner,p.reviewer,
      p.next_review nextReview,p.contract_end contractEnd,p.created_at createdAt,p.updated_at updatedAt,
      CASE WHEN p.status IN ('offboarded','rejected') THEN
        (SELECT MAX(e.created_at) FROM third_party_events e WHERE e.vendor_id=p.vendor_id
          AND e.action=CASE p.status WHEN 'offboarded' THEN 'vendor-offboard' ELSE 'assessment-rejected' END)
        END completedAt
      FROM third_party_profiles p
      ORDER BY CASE WHEN p.status IN ('offboarded','rejected') THEN 1 ELSE 0 END,
        CASE WHEN p.status IN ('offboarded','rejected') THEN completedAt END DESC,
        CASE p.criticality WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,p.next_review,p.vendor_id
      LIMIT ?`).bind(TPRM_WORK_LIMIT + 1).all(),
    db.prepare(`SELECT a.id,a.vendor_id vendorId,a.cycle_number cycleNumber,a.status,a.risk_tier riskTier,
      a.created_at createdAt,a.updated_at updatedAt,a.decided_by decidedBy,
      CASE WHEN a.status IN ('approved','conditional','rejected','superseded') THEN a.decided_at END completedAt
      FROM third_party_assessments a LEFT JOIN third_party_profiles p ON p.vendor_id=a.vendor_id
      ORDER BY CASE WHEN a.status IN ('draft','submitted') AND (p.status IS NULL OR p.status NOT IN ('offboarded','rejected')) THEN 0 ELSE 1 END,
        completedAt DESC,CASE a.risk_tier WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,a.updated_at DESC,a.id
      LIMIT ?`).bind(TPRM_WORK_LIMIT + 1).all(),
    db.prepare(`SELECT f.id,f.vendor_id vendorId,f.assessment_id assessmentId,f.title,f.status,f.severity,f.owner,f.due_date dueDate,
      f.created_at createdAt,f.updated_at updatedAt,f.verified_by verifiedBy,CASE WHEN f.status='closed' THEN f.verified_at END completedAt
      FROM third_party_findings f LEFT JOIN third_party_profiles p ON p.vendor_id=f.vendor_id
      ORDER BY CASE WHEN f.status='closed' OR p.status IN ('offboarded','rejected') THEN 1 ELSE 0 END,completedAt DESC,
        CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,f.due_date,f.id
      LIMIT ?`).bind(TPRM_WORK_LIMIT + 1).all(),
  ]);
  return { profiles: profiles.results.slice(0, TPRM_WORK_LIMIT), assessments: assessments.results.slice(0, TPRM_WORK_LIMIT),
    findings: findings.results.slice(0, TPRM_WORK_LIMIT), complete: [profiles, assessments, findings].every(result => result.results.length <= TPRM_WORK_LIMIT) };
}
