import { cleanAiText, redactSensitiveText } from "./security";
export const AI_IMPACT_TYPES = ["DPIA", "FRIA", "Combined"] as const;
const realDate = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  },
  rating = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5)
      throw new Error("Etki puanları 1–5 arasında olmalıdır.");
    return n;
  };
export function calculateImpact(input: {
  privacy: number;
  fundamentalRights: number;
  safety: number;
  workforce: number;
  vulnerableGroups: number;
  autonomy: number;
  scale: number;
  controlMaturity: number;
  personalData: boolean;
  specialCategoryData: boolean;
  automatedDecision: boolean;
  children: boolean;
  hasTransparency: boolean;
  hasHumanOversight: boolean;
  hasAppeal: boolean;
  dpoConsulted: boolean;
}) {
  const base =
      input.privacy +
      input.fundamentalRights +
      input.safety +
      input.workforce +
      input.vulnerableGroups +
      input.autonomy +
      input.scale,
    modifiers =
      (input.personalData ? 4 : 0) +
      (input.specialCategoryData ? 8 : 0) +
      (input.automatedDecision ? 8 : 0) +
      (input.children ? 8 : 0),
    inherent = Math.min(100, Math.round(((base - 7) / 28) * 70) + modifiers),
    residual = Math.max(
      1,
      Math.round(inherent * (1 - input.controlMaturity / 6)),
    ),
    tier =
      residual >= 70
        ? "Critical"
        : residual >= 45
          ? "High"
          : residual >= 20
            ? "Medium"
            : "Low",
    criticalGaps = [
      ...(input.automatedDecision && !input.hasHumanOversight
        ? ["humanOversight"]
        : []),
      ...(input.personalData && !input.dpoConsulted ? ["dpoConsultation"] : []),
      ...((input.children || input.vulnerableGroups >= 4) && !input.hasAppeal
        ? ["appealMechanism"]
        : []),
      ...(!input.hasTransparency ? ["transparencyNotice"] : []),
    ];
  return { inherent, residual, tier, criticalGaps };
}
export function validateImpactAssessment(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    riskId: cleanAiText(input.riskId, 100),
    type: cleanAiText(input.type, 20),
    title: redactSensitiveText(input.title, 180),
    context: redactSensitiveText(input.context, 1600),
    affectedGroups: redactSensitiveText(input.affectedGroups, 1000),
    jurisdictions: redactSensitiveText(input.jurisdictions, 500),
    necessity: redactSensitiveText(input.necessity, 1600),
    proportionality: redactSensitiveText(input.proportionality, 1600),
    mitigations: redactSensitiveText(input.mitigations, 2000),
    monitoringPlan: redactSensitiveText(input.monitoringPlan, 1600),
    consultation: redactSensitiveText(input.consultation, 1200),
    owner: redactSensitiveText(input.owner, 320),
    dpo: redactSensitiveText(input.dpo, 320),
    reviewDate: cleanAiText(input.reviewDate, 10),
    privacy: rating(input.privacy),
    fundamentalRights: rating(input.fundamentalRights),
    safety: rating(input.safety),
    workforce: rating(input.workforce),
    vulnerableGroups: rating(input.vulnerableGroups),
    autonomy: rating(input.autonomy),
    scale: rating(input.scale),
    controlMaturity: rating(input.controlMaturity),
    personalData: input.personalData === true,
    specialCategoryData: input.specialCategoryData === true,
    automatedDecision: input.automatedDecision === true,
    children: input.children === true,
    workers: input.workers === true,
    publicServices: input.publicServices === true,
    hasTransparency: input.hasTransparency === true,
    hasHumanOversight: input.hasHumanOversight === true,
    hasAppeal: input.hasAppeal === true,
    dpoConsulted: input.dpoConsulted === true,
  };
  if (
    !value.modelId ||
    !AI_IMPACT_TYPES.includes(value.type as (typeof AI_IMPACT_TYPES)[number]) ||
    value.title.length < 5 ||
    value.context.length < 10 ||
    value.affectedGroups.length < 3 ||
    value.jurisdictions.length < 2 ||
    value.necessity.length < 10 ||
    value.proportionality.length < 10 ||
    value.mitigations.length < 10 ||
    value.monitoringPlan.length < 10 ||
    value.owner.length < 3 ||
    !realDate(value.reviewDate)
  )
    throw new Error(
      "Etki değerlendirmesinin kapsam, gereklilik, orantılılık, azaltım, izleme, sahiplik ve tarihi eksiksiz olmalıdır.",
    );
  if ((value.personalData || value.specialCategoryData) && value.dpo.length < 3)
    throw new Error(
      "Kişisel veri işleyen değerlendirmede DPO/Privacy sorumlusu zorunludur.",
    );
  return { ...value, ...calculateImpact(value) };
}
export function impactReviewState(
  status: string,
  reviewDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "suspended") return "suspended";
  if (reviewDate < today) return "overdue";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return reviewDate <= d.toISOString().slice(0, 10) ? "due-soon" : "current";
}
