import {ensureFindingsSchemaCompatibility} from "../api/findings/schema-compat";
import {storedFindingCode} from "./codes";
import { validateFinding } from "./domain";
import type { CapaPromotionCandidate } from "../continuous-assurance-capa";

async function event(db: D1Database, input: { findingId: string; action: string; detail: string; evidenceReference?: string; evidenceSha256?: string; actor: string; createdAt: string }) {
  await db.prepare("INSERT INTO enterprise_finding_events(id,finding_id,action,from_status,to_status,detail,evidence_reference,evidence_sha256,actor,created_at) VALUES(?,?,?,'','open',?,?,?,?,?)")
    .bind(crypto.randomUUID(), input.findingId, input.action, input.detail.slice(0, 2000), input.evidenceReference || null, input.evidenceSha256 || null, input.actor, input.createdAt).run();
}

export async function promoteContinuousAssuranceFinding(
  db: D1Database,
  candidate: CapaPromotionCandidate,
  approvalActor: string,
  queueActor: string,
  workItemId: string,
  now = new Date(),
) {
  if (!candidate.eligible || !candidate.payload) throw new Error("CAPA promotion adayı doğrulanmış değil.");
  await ensureFindingsSchemaCompatibility(db);
  const today = now.toISOString().slice(0, 10);
  const validated = validateFinding(candidate.payload, today);
  const existing = await db.prepare("SELECT id,code,status FROM enterprise_findings WHERE source_type='continuous-control' AND source_ref=? AND control_ref=? AND status NOT IN ('closed','accepted') ORDER BY detected_at DESC LIMIT 1")
    .bind(validated.sourceRef, validated.controlRef).first<{ id: string; code: string; status: string }>();
  if (existing) return { id: existing.id, code: existing.code, status: existing.status, created: false };

  const id = `FND-${crypto.randomUUID()}`;
  const code = id;
  const stamp = now.toISOString();
  const detectedBy = "system:continuous-assurance";
  await db.prepare("INSERT INTO enterprise_findings(id,code,source_type,source_ref,source_title,finding_type,title,description,severity,owner,reviewer,root_cause,corrective_action,preventive_action,due_date,status,risk_ref,control_ref,evidence_reference,evidence_sha256,detected_by,detected_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?)")
    .bind(
      id,
      code,
      validated.sourceType,
      validated.sourceRef,
      validated.sourceTitle,
      validated.findingType,
      validated.title,
      validated.description,
      validated.severity,
      validated.owner,
      validated.reviewer,
      validated.rootCause,
      validated.correctiveAction,
      validated.preventiveAction,
      validated.dueDate,
      validated.riskRef || null,
      validated.controlRef || null,
      candidate.lineage.originEvidenceReference,
      candidate.lineage.originEvidenceSha256,
      detectedBy,
      stamp,
      approvalActor,
      stamp,
    ).run();
  await event(db, {
    findingId: id,
    action: "continuous-assurance-promotion",
    detail: `Promoted from ${candidate.lineage.automationFindingRef}; rule ${candidate.lineage.automationRuleRef}; control ${candidate.lineage.controlRef}; risk ${candidate.lineage.riskRef}; work item ${workItemId}; queued by ${queueActor}; approved by ${approvalActor}`,
    evidenceReference: candidate.lineage.originEvidenceReference,
    evidenceSha256: candidate.lineage.originEvidenceSha256,
    actor: approvalActor,
    createdAt: stamp,
  });
  return { id, code:await storedFindingCode(db,id), status: "open", created: true };
}
