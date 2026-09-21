import { validateFinding } from "./domain";
import type { CapaPromotionCandidate } from "../continuous-assurance-capa";

const schema = [
  `CREATE TABLE IF NOT EXISTS enterprise_findings(id TEXT PRIMARY KEY NOT NULL,code TEXT NOT NULL UNIQUE,source_type TEXT NOT NULL,source_ref TEXT NOT NULL,source_title TEXT NOT NULL,finding_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,severity TEXT NOT NULL,owner TEXT NOT NULL,reviewer TEXT NOT NULL,root_cause TEXT NOT NULL,corrective_action TEXT NOT NULL,preventive_action TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',risk_ref TEXT,control_ref TEXT,evidence_reference TEXT,evidence_sha256 TEXT,verification_evidence_reference TEXT,verification_evidence_sha256 TEXT,acceptance_rationale TEXT,accept_until TEXT,recurrence_count INTEGER NOT NULL DEFAULT 0,detected_by TEXT NOT NULL,detected_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,started_by TEXT,started_at TEXT,submitted_by TEXT,submitted_at TEXT,verified_by TEXT,verified_at TEXT,reopened_by TEXT,reopened_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_status_due_idx ON enterprise_findings(status,severity,due_date)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_source_idx ON enterprise_findings(source_type,source_ref)`,
  `CREATE TABLE IF NOT EXISTS enterprise_finding_events(id TEXT PRIMARY KEY NOT NULL,finding_id TEXT NOT NULL,action TEXT NOT NULL,from_status TEXT,to_status TEXT,detail TEXT NOT NULL,evidence_reference TEXT,evidence_sha256 TEXT,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enterprise_finding_events_finding_date_idx ON enterprise_finding_events(finding_id,created_at)`,
];

async function ready(db: D1Database) {
  for (const sql of schema) await db.prepare(sql).run();
}

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
  await ready(db);
  const today = now.toISOString().slice(0, 10);
  const uniqueSourceRef = candidate.lineage.automationFindingRef;
  const validated = validateFinding({ ...candidate.payload, sourceRef: uniqueSourceRef }, today);
  const existing = await db.prepare("SELECT id,code,status FROM enterprise_findings WHERE source_type='control' AND source_ref=? ORDER BY detected_at DESC LIMIT 1").bind(uniqueSourceRef).first<{ id: string; code: string; status: string }>();
  if (existing) return { id: existing.id, code: existing.code, status: existing.status, created: false };

  const id = `FND-${crypto.randomUUID()}`;
  const code = `FND-${now.getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
    detail: `Promoted from ${candidate.lineage.automationFindingRef}; rule ${candidate.lineage.automationRuleRef}; work item ${workItemId}; queued by ${queueActor}; approved by ${approvalActor}`,
    evidenceReference: candidate.lineage.originEvidenceReference,
    evidenceSha256: candidate.lineage.originEvidenceSha256,
    actor: approvalActor,
    createdAt: stamp,
  });
  return { id, code, status: "open", created: true };
}
