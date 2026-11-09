import {readWorkflowEvidencePins} from "../workflow-selection-store";
import type {ContinuityActivityFile,VerificationExercise} from "./activity-file";

// Shared by the read projection and the closure check. The mutation also verifies the actor.
export const eligibleRetest = `e.status='completed' AND e.outcome='passed'
  AND e.rto_breached=0 AND e.rpo_breached=0
  AND e.actual_recovery_hours<=p.rto_hours AND e.actual_data_loss_hours<=p.rpo_hours
  AND julianday(e.completed_at)>=julianday(e.created_at) AND e.completed_by<>''
  AND e.evidence_reference<>'' AND length(e.evidence_sha256)=64
  AND e.evidence_sha256 NOT GLOB '*[^a-fA-F0-9]*'`;

export async function readContinuityActivityFile(db:D1Database,kind:"exercise"|"gap",id:string):Promise<ContinuityActivityFile|null> {
  const gapFile=kind==="gap";
  const gap=gapFile
    ? await db.prepare("SELECT plan_id,exercise_id,reviewer,status,evidence_reference,created_at FROM enterprise_continuity_gaps WHERE id=?").bind(id).first<{
        plan_id:string;exercise_id:string;reviewer:string;status:string;evidence_reference:string|null;created_at:string;
      }>() : null;
  const record=gapFile ? gap : await db.prepare("SELECT plan_id,id AS exercise_id FROM enterprise_continuity_exercises WHERE id=?").bind(id).first<{plan_id:string;exercise_id:string}>();
  if(!record) return null;
  const [plan,source,gaps,verification,candidates,pins]=await Promise.all([
    db.prepare("SELECT id,code,name,status,rto_hours AS rtoHours,rpo_hours AS rpoHours FROM enterprise_continuity_plans WHERE id=?")
      .bind(record.plan_id).first<NonNullable<ContinuityActivityFile["plan"]>>(),
    db.prepare(`SELECT id,code,scenario,status,scheduled_date AS scheduledDate,actual_recovery_hours AS actualRecoveryHours,
      actual_data_loss_hours AS actualDataLossHours,evidence_reference AS evidenceReference
      FROM enterprise_continuity_exercises WHERE id=? AND plan_id=?`)
      .bind(record.exercise_id,record.plan_id).first<NonNullable<ContinuityActivityFile["source"]>>(),
    gapFile?[]:db.prepare("SELECT id,title,status FROM enterprise_continuity_gaps WHERE exercise_id=? AND plan_id=? ORDER BY due_date,id")
      .bind(id,record.plan_id).all<ContinuityActivityFile["gaps"][number]>().then(result=>result.results),
    gapFile?db.prepare(`SELECT v.exercise_id AS id,COALESCE(e.code,v.exercise_id) AS code,e.scheduled_date AS scheduledDate
      FROM enterprise_continuity_gap_verifications v LEFT JOIN enterprise_continuity_exercises e ON e.id=v.exercise_id AND e.plan_id=?
      WHERE v.gap_id=?`).bind(record.plan_id,id).first<VerificationExercise>():null,
    gap?.status==="open"?db.prepare(`SELECT e.id,e.code,e.scheduled_date AS scheduledDate FROM enterprise_continuity_exercises e
      JOIN enterprise_continuity_plans p ON p.id=e.plan_id WHERE e.plan_id=? AND e.id<>? AND ${eligibleRetest}
      AND julianday(e.created_at)>=julianday(?) AND julianday(e.completed_at)>julianday(?)
      AND e.facilitator<>? AND e.completed_by<>? ORDER BY e.completed_at DESC,e.id`)
      .bind(record.plan_id,record.exercise_id,gap.created_at,gap.created_at,gap.reviewer,gap.reviewer)
      .all<VerificationExercise>().then(result=>result.results):[],
    readWorkflowEvidencePins(db,"continuity",[id]),
  ]);
  return {plan,source,gaps,verification,candidates,closureEvidenceReference:gap?.evidence_reference??null,pins};
}
