export function parseTraceabilityWorkIds(raw: string | null): string[] | undefined {
  if (raw === null) return undefined;
  if (raw.length > 8000) throw new Error("Invalid work IDs");
  const ids: unknown = JSON.parse(raw);
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== "string" || !id || id.length > 120 || id.trim() !== id || /\p{Cc}/u.test(id)) || new Set(ids).size !== ids.length) throw new Error("Invalid work IDs");
  return ids;
}
type TraceabilityRow = {
 work_item_id:string; finding_id:string; result_ref:string; completed_at:string|null;
 enterprise_id:string|null; enterprise_code:string|null; enterprise_status:string|null;
 evidence_reference:string|null; verification_evidence_reference:string|null; recurrence_count:number|null;
};
export async function readCapaTraceability(db:D1Database,workIds?:string[]) {
 const result=await db.prepare(`
      SELECT
        w.id AS work_item_id,
        w.finding_id,
        w.result_ref,
        w.completed_at,
        ef.id AS enterprise_id,
        ef.code AS enterprise_code,
        ef.status AS enterprise_status,
        ef.evidence_reference,
        ef.verification_evidence_reference,
        ef.recurrence_count
      FROM continuous_assurance_work_items w
      LEFT JOIN enterprise_findings ef ON ef.id = w.result_ref
      WHERE w.action = 'capa-promotion'
        AND w.status = 'completed'
        AND w.result_ref IS NOT NULL
        AND TRIM(w.result_ref) != ''
        ${workIds ? `AND w.id IN (${workIds.map(() => "?").join(",")})` : ""}
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC, w.id DESC
      LIMIT 501
    `).bind(...(workIds||[])).all<TraceabilityRow>();
    const items = result.results.slice(0,500).map((row) => ({
      workItemId: row.work_item_id,
      findingId: row.finding_id,
      resultRef: row.result_ref,
      completedAt: row.completed_at || "",
      enterpriseFinding: row.enterprise_id ? {
        id: row.enterprise_id,
        code: row.enterprise_code || "",
        status: row.enterprise_status || "",
        evidenceReference: row.evidence_reference || "",
        verificationEvidenceReference: row.verification_evidence_reference || "",
        recurrenceCount: Math.max(0, Number(row.recurrence_count || 0)),
      } : null,
    }));

 return {items,coverage:{loaded:items.length,complete:result.results.length<=500}};
}
