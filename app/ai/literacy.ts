import { cleanAiText, redactSensitiveText } from "./security";
export const AI_OPERATOR_ROLES = [
  "user",
  "reviewer",
  "approver",
  "operator",
  "developer",
  "administrator",
] as const;
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function requiredTraining(role: string, riskTier: string) {
  const base = ["ai-basics", "acceptable-use", "security-privacy"];
  if (
    ["reviewer", "approver", "operator", "developer", "administrator"].includes(
      role,
    )
  )
    base.push("human-oversight", "incident-reporting");
  if (["developer", "administrator"].includes(role))
    base.push("secure-ai-lifecycle");
  if (["High", "Critical"].includes(riskTier)) base.push("high-risk-controls");
  return [...new Set(base)];
}
export function validateLiteracy(
  input: Record<string, unknown>,
  riskTier = "Medium",
) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    principal: redactSensitiveText(input.principal, 320),
    displayName: redactSensitiveText(input.displayName, 180),
    role: cleanAiText(input.role, 30),
    manager: redactSensitiveText(input.manager, 320),
    completedModules: Array.isArray(input.completedModules)
      ? input.completedModules
          .map((x) => cleanAiText(x, 60))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    score: Number(input.score),
    attested: input.attested === true,
    trainedAt: cleanAiText(input.trainedAt, 10),
    validUntil: cleanAiText(input.validUntil, 10),
    limitationsAcknowledged: input.limitationsAcknowledged === true,
    incidentDutyAcknowledged: input.incidentDutyAcknowledged === true,
  };
  if (
    !value.modelId ||
    value.principal.length < 3 ||
    value.displayName.length < 2 ||
    !AI_OPERATOR_ROLES.includes(
      value.role as (typeof AI_OPERATOR_ROLES)[number],
    ) ||
    value.manager.length < 3
  )
    throw new Error("Model, çalışan, rol ve yönetici zorunludur.");
  if (!Number.isInteger(value.score) || value.score < 0 || value.score > 100)
    throw new Error("Yetkinlik skoru 0–100 arasında olmalıdır.");
  if (
    !date(value.trainedAt) ||
    !date(value.validUntil) ||
    value.validUntil <= value.trainedAt
  )
    throw new Error("Eğitim ve geçerlilik tarihleri geçersizdir.");
  const required = requiredTraining(value.role, riskTier),
    missing = required.filter((x) => !value.completedModules.includes(x));
  if (
    !value.attested ||
    !value.limitationsAcknowledged ||
    !value.incidentDutyAcknowledged
  )
    missing.push("attestation");
  if (value.score < 80) missing.push("minimum-score");
  return {
    ...value,
    requiredModules: required,
    missing: [...new Set(missing)],
  };
}
export function literacyAttention(
  status: string,
  validUntil: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "revoked") return "revoked";
  if (validUntil < today) return "expired";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return validUntil <= d.toISOString().slice(0, 10)
    ? "expires-soon"
    : "current";
}
