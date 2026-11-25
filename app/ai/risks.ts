import { cleanAiText, redactSensitiveText } from "./security";

export const AI_RISK_CATEGORIES = [
  "security",
  "privacy",
  "bias",
  "reliability",
  "compliance",
  "third-party",
  "operational",
] as const;
export const AI_RISK_TREATMENTS = [
  "mitigate",
  "accept",
  "avoid",
  "transfer",
] as const;

const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};
const score = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5)
    throw new Error("Risk puanları 1–5 arasında olmalıdır.");
  return parsed;
};

export function calculateAiRisk(
  likelihood: number,
  impact: number,
  controlEffectiveness: number,
) {
  const inherent = likelihood * impact;
  const residual = Math.max(
    1,
    Math.round(inherent * (1 - controlEffectiveness / 6)),
  );
  const tier =
    residual >= 16
      ? "Critical"
      : residual >= 10
        ? "High"
        : residual >= 5
          ? "Medium"
          : "Low";
  return { inherent, residual, tier };
}

export function validateAiRisk(input: Record<string, unknown>) {
  const likelihood = score(input.likelihood),
    impact = score(input.impact),
    controlEffectiveness = score(input.controlEffectiveness);
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    incidentId: cleanAiText(input.incidentId, 100),
    changeId: cleanAiText(input.changeId, 100),
    category: cleanAiText(input.category, 40),
    title: redactSensitiveText(input.title, 180),
    description: redactSensitiveText(input.description, 1600),
    cause: redactSensitiveText(input.cause, 800),
    consequence: redactSensitiveText(input.consequence, 800),
    owner: redactSensitiveText(input.owner, 320),
    likelihood,
    impact,
    controlEffectiveness,
    treatment: cleanAiText(input.treatment, 30),
    treatmentPlan: redactSensitiveText(input.treatmentPlan, 1600),
    treatmentOwner: redactSensitiveText(input.treatmentOwner, 320),
    dueDate: cleanAiText(input.dueDate, 10),
  };
  if (
    !value.modelId ||
    !AI_RISK_CATEGORIES.includes(
      value.category as (typeof AI_RISK_CATEGORIES)[number],
    ) ||
    !AI_RISK_TREATMENTS.includes(
      value.treatment as (typeof AI_RISK_TREATMENTS)[number],
    )
  )
    throw new Error("Model, risk kategorisi ve tedavi kararı zorunludur.");
  if (
    value.title.length < 5 ||
    value.description.length < 10 ||
    value.cause.length < 5 ||
    value.consequence.length < 5 ||
    value.owner.length < 3 ||
    value.treatmentPlan.length < 10 ||
    value.treatmentOwner.length < 3
  )
    throw new Error(
      "Risk tanımı, neden, sonuç, sorumlu ve tedavi planı eksiksiz girilmelidir.",
    );
  if (!realDate(value.dueDate))
    throw new Error("Geçerli aksiyon tarihi gereklidir.");
  return {
    ...value,
    ...calculateAiRisk(likelihood, impact, controlEffectiveness),
  };
}

export function validateRiskDecision(
  input: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
) {
  const status = cleanAiText(input.status, 30),
    note = redactSensitiveText(input.note, 1000),
    confirmation = cleanAiText(input.confirmation, 30),
    acceptanceExpiry = cleanAiText(input.acceptanceExpiry, 10);
  if (
    !["open", "treatment", "accepted", "closed"].includes(status) ||
    note.length < 5
  )
    throw new Error("Geçerli durum ve karar notu gereklidir.");
  const expected =
    status === "accepted"
      ? "RİSKİ KABUL ET"
      : status === "closed"
        ? "RİSKİ KAPAT"
        : status === "treatment"
          ? "TEDAVİYE AL"
          : "RİSKİ AÇ";
  if (confirmation !== expected) throw new Error(`Onay metni: ${expected}`);
  if (status === "accepted") {
    if (!realDate(acceptanceExpiry) || acceptanceExpiry <= today)
      throw new Error("Risk kabulü için ileri tarihli süre sonu zorunludur.");
    const max = new Date(`${today}T00:00:00Z`);
    max.setUTCDate(max.getUTCDate() + 365);
    if (acceptanceExpiry > max.toISOString().slice(0, 10))
      throw new Error("Risk kabul süresi 365 günü aşamaz.");
  }
  return {
    status,
    note,
    acceptanceExpiry: status === "accepted" ? acceptanceExpiry : "",
  };
}

export function aiRiskAttention(
  status: string,
  dueDate: string,
  acceptanceExpiry: string | null,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "accepted" && acceptanceExpiry && acceptanceExpiry < today)
    return "acceptance-expired";
  if (!["closed", "accepted"].includes(status) && dueDate < today)
    return "overdue";
  return "current";
}
