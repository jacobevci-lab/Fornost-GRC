import { cleanAiText, redactSensitiveText } from "./security";
import type { AiDraftKind } from "./drafts";

export type PublishableDraftKind = Extract<AiDraftKind, "risk-treatment" | "audit-finding">;

export function publicationModule(kind: AiDraftKind) {
  if (kind === "risk-treatment") return "Risk Assessment";
  if (kind === "audit-finding") return "Denetim Yönetimi";
  return null;
}

export function applyAiDraftToRecord(kind: PublishableDraftKind, payload: Record<string, unknown>, current: Record<string, unknown>, draftId: string, publicationNote: string) {
  const result = { ...current, aiDraftRef: cleanAiText(draftId, 100), aiPublicationNote: redactSensitiveText(publicationNote, 800) };
  if (kind === "risk-treatment") {
    const values = {
      plannedAction: redactSensitiveText(payload.proposedTreatment, 1600), actionOwner: redactSensitiveText(payload.owner, 320),
      targetDate: cleanAiText(payload.dueDate, 10), actionPriority: redactSensitiveText(payload.priority, 80),
    };
    if (Object.values(values).some((value) => !value)) throw new Error("Yayınlanacak risk tedavisinde zorunlu alan eksik.");
    Object.assign(result, values);
  } else {
    const values = {
      finding: redactSensitiveText(payload.condition, 1600), findingCriteria: redactSensitiveText(payload.criteria, 1200),
      findingImpact: redactSensitiveText(payload.impact, 1200), recommendation: redactSensitiveText(payload.recommendation, 1600),
      findingSeverity: redactSensitiveText(payload.severity, 80),
    };
    if (Object.values(values).some((value) => !value)) throw new Error("Yayınlanacak denetim bulgusunda zorunlu alan eksik.");
    Object.assign(result, values);
  }
  if (JSON.stringify(result).length > 100_000) throw new Error("Yayınlanacak kayıt izin verilen boyutu aşıyor.");
  return result;
}
