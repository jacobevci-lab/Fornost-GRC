import { cleanAiText, redactSensitiveText } from "./security";
export const AI_PRINCIPAL_TYPES = [
  "user",
  "group",
  "service-account",
  "workload",
] as const;
export const AI_ACCESS_LEVELS = [
  "use",
  "read-data",
  "manage",
  "admin",
] as const;
const realDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
};
export function accessRisk(input: {
  principalType: string;
  accessLevel: string;
  dataScope: string;
  mfa: boolean;
  conditionalAccess: boolean;
  jit: boolean;
  managedIdentity: boolean;
  keyRotationDays: number;
}) {
  let score =
    input.accessLevel === "admin"
      ? 5
      : input.accessLevel === "manage"
        ? 4
        : input.accessLevel === "read-data"
          ? 3
          : 2;
  if (/confidential|restricted/i.test(input.dataScope)) score += 2;
  if (
    input.principalType === "service-account" ||
    input.principalType === "workload"
  ) {
    if (!input.managedIdentity) score += 2;
    if (input.keyRotationDays > 90) score += 1;
  } else {
    if (!input.mfa) score += 2;
    if (!input.conditionalAccess) score += 1;
  }
  if (input.jit) score -= 1;
  score = Math.max(1, Math.min(10, score));
  return {
    score,
    tier:
      score >= 8
        ? "Critical"
        : score >= 6
          ? "High"
          : score >= 4
            ? "Medium"
            : "Low",
  };
}
export function validateAiAccess(
  input: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    principalType: cleanAiText(input.principalType, 30),
    principal: redactSensitiveText(input.principal, 320),
    displayName: redactSensitiveText(input.displayName, 180),
    accessLevel: cleanAiText(input.accessLevel, 30),
    dataScope: redactSensitiveText(input.dataScope, 500),
    purpose: redactSensitiveText(input.purpose, 1000),
    owner: redactSensitiveText(input.owner, 320),
    mfa: input.mfa === true,
    conditionalAccess: input.conditionalAccess === true,
    jit: input.jit === true,
    managedIdentity: input.managedIdentity === true,
    keyRotationDays: Number(input.keyRotationDays),
    lastUsed: cleanAiText(input.lastUsed, 10),
    expiresAt: cleanAiText(input.expiresAt, 10),
    reviewDate: cleanAiText(input.reviewDate, 10),
  };
  if (
    !value.modelId ||
    !AI_PRINCIPAL_TYPES.includes(
      value.principalType as (typeof AI_PRINCIPAL_TYPES)[number],
    ) ||
    !AI_ACCESS_LEVELS.includes(
      value.accessLevel as (typeof AI_ACCESS_LEVELS)[number],
    )
  )
    throw new Error("Model, kimlik türü ve erişim seviyesi zorunludur.");
  if (
    value.principal.length < 3 ||
    value.displayName.length < 2 ||
    value.dataScope.length < 2 ||
    value.purpose.length < 10 ||
    value.owner.length < 3
  )
    throw new Error(
      "Kimlik, kapsam, amaç ve erişim sahibi eksiksiz girilmelidir.",
    );
  if (
    !realDate(value.lastUsed) ||
    !realDate(value.expiresAt) ||
    !realDate(value.reviewDate) ||
    value.expiresAt < value.lastUsed
  )
    throw new Error("Erişim yaşam döngüsü tarihleri geçersizdir.");
  if (
    value.lastUsed > today ||
    value.expiresAt <= today ||
    value.reviewDate <= today
  )
    throw new Error(
      "Son kullanım gelecekte olamaz; erişim ve inceleme tarihleri ileri tarihli olmalıdır.",
    );
  if (
    !Number.isInteger(value.keyRotationDays) ||
    value.keyRotationDays < 1 ||
    value.keyRotationDays > 365
  )
    throw new Error("Anahtar rotasyonu 1–365 gün arasında olmalıdır.");
  const machine = ["service-account", "workload"].includes(value.principalType);
  if (machine && value.mfa)
    throw new Error(
      "Makine kimlikleri için MFA yerine managed identity kullanılmalıdır.",
    );
  return { ...value, ...accessRisk(value) };
}
export function accessAttention(
  row: {
    status: string;
    principalType: string;
    lastUsed: string;
    expiresAt: string;
    reviewDate: string;
  },
  today = new Date().toISOString().slice(0, 10),
) {
  if (row.status === "revoked") return "revoked";
  if (row.expiresAt < today) return "expired";
  if (row.reviewDate < today) return "review-overdue";
  const inactive = new Date(`${today}T00:00:00Z`);
  inactive.setUTCDate(inactive.getUTCDate() - 90);
  if (row.lastUsed < inactive.toISOString().slice(0, 10)) return "inactive";
  return "current";
}
