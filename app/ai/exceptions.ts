import { cleanAiText, redactSensitiveText } from "./security";

export const AI_EXCEPTION_TYPES = ["policy", "control", "risk", "release"] as const;
export const AI_EXCEPTION_RISKS = ["Low", "Medium", "High", "Critical"] as const;

const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function validateAiException(input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    parentId: cleanAiText(input.parentId, 100),
    type: cleanAiText(input.type, 20),
    reference: redactSensitiveText(input.reference, 160),
    title: redactSensitiveText(input.title, 200),
    justification: redactSensitiveText(input.justification, 2000),
    scope: redactSensitiveText(input.scope, 1200),
    compensatingControls: redactSensitiveText(input.compensatingControls, 2000),
    owner: redactSensitiveText(input.owner, 320),
    riskTier: cleanAiText(input.riskTier, 20),
    expiresAt: cleanAiText(input.expiresAt, 10),
    reviewAt: cleanAiText(input.reviewAt, 10),
  };
  if (!value.modelId || !AI_EXCEPTION_TYPES.includes(value.type as (typeof AI_EXCEPTION_TYPES)[number])) throw new Error("AI modeli ve geçerli istisna türü zorunludur.");
  if (value.title.length < 5 || value.reference.length < 2 || value.justification.length < 20 || value.scope.length < 10 || value.compensatingControls.length < 20 || value.owner.length < 3) throw new Error("Başlık, referans, gerekçe, kapsam, sorumlu ve telafi edici kontroller eksiksiz girilmelidir.");
  if (!AI_EXCEPTION_RISKS.includes(value.riskTier as (typeof AI_EXCEPTION_RISKS)[number])) throw new Error("Geçerli istisna risk seviyesi zorunludur.");
  if (!realDate(value.expiresAt) || !realDate(value.reviewAt) || value.expiresAt <= today || value.reviewAt < today || value.reviewAt > value.expiresAt) throw new Error("İleri tarihli ve istisna süresini aşmayan inceleme tarihi zorunludur.");
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 180);
  if (value.expiresAt > max.toISOString().slice(0, 10)) throw new Error("AI istisnası 180 günü aşamaz.");
  return value;
}

export function validateAiExceptionDecision(input: Record<string, unknown>) {
  const status = cleanAiText(input.status, 20), note = redactSensitiveText(input.note, 1200), confirmation = cleanAiText(input.confirmation, 40);
  if (!(["approved", "rejected", "revoked"] as const).includes(status as "approved" | "rejected" | "revoked") || note.length < 10) throw new Error("Geçerli karar ve en az 10 karakter karar gerekçesi zorunludur.");
  const expected = status === "approved" ? "İSTİSNAYI ONAYLA" : status === "rejected" ? "İSTİSNAYI REDDET" : "İSTİSNAYI GERİ ÇEK";
  if (confirmation !== expected) throw new Error(`Onay metni: ${expected}`);
  return { status: status as "approved" | "rejected" | "revoked", note };
}

export function exceptionState(status: string, expiresAt: string, reviewAt: string, today = new Date().toISOString().slice(0, 10)) {
  if (status === "approved" && expiresAt < today) return "expired";
  if (status === "approved" && reviewAt < today) return "review-overdue";
  return status;
}
