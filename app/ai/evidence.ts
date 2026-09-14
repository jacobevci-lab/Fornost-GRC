import { cleanAiText, redactSensitiveText } from "./security";
export const AI_EVIDENCE_TYPES = [
  "test-result",
  "config-snapshot",
  "log-export",
  "policy",
  "approval",
  "screenshot",
  "report",
  "other",
] as const;
export const AI_EVIDENCE_CLASSES = [
  "Public",
  "Internal",
  "Confidential",
  "Restricted",
] as const;
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v;
};
export function normalizeSha256(value: unknown) {
  const hash = cleanAiText(value, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new Error("Geçerli SHA-256 hash gereklidir.");
  return hash;
}
export function validateAiEvidence(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    controlId: cleanAiText(input.controlId, 100),
    changeId: cleanAiText(input.changeId, 100),
    incidentId: cleanAiText(input.incidentId, 100),
    type: cleanAiText(input.type, 40),
    title: redactSensitiveText(input.title, 180),
    description: redactSensitiveText(input.description, 1600),
    source: redactSensitiveText(input.source, 500),
    collectionMethod: redactSensitiveText(input.collectionMethod, 500),
    classification: cleanAiText(input.classification, 30),
    owner: redactSensitiveText(input.owner, 320),
    expectedHash: normalizeSha256(input.expectedHash),
    collectedAt: cleanAiText(input.collectedAt, 10),
    validUntil: cleanAiText(input.validUntil, 10),
  };
  if (
    !value.modelId ||
    !AI_EVIDENCE_TYPES.includes(
      value.type as (typeof AI_EVIDENCE_TYPES)[number],
    ) ||
    !AI_EVIDENCE_CLASSES.includes(
      value.classification as (typeof AI_EVIDENCE_CLASSES)[number],
    )
  )
    throw new Error("Model, kanıt türü ve veri sınıfı zorunludur.");
  if (
    value.title.length < 5 ||
    value.description.length < 10 ||
    value.source.length < 3 ||
    value.collectionMethod.length < 3 ||
    value.owner.length < 3
  )
    throw new Error(
      "Kanıt tanımı, kaynak, toplama yöntemi ve sorumlu zorunludur.",
    );
  if (
    !validDate(value.collectedAt) ||
    !validDate(value.validUntil) ||
    value.validUntil < value.collectedAt
  )
    throw new Error("Kanıt geçerlilik tarihleri hatalıdır.");
  return value;
}
export function evidenceExpiryState(
  validUntil: string,
  status: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status !== "approved") return status;
  if (validUntil < today) return "expired";
  const warning = new Date(`${today}T00:00:00Z`);
  warning.setUTCDate(warning.getUTCDate() + 30);
  return validUntil <= warning.toISOString().slice(0, 10)
    ? "expiring"
    : "valid";
}
