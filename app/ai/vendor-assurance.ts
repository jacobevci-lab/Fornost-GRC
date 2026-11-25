import { cleanAiText, redactSensitiveText } from "./security";

export const AI_VENDOR_CONTROLS = [
  "dpa",
  "trainingOptOut",
  "deletionCommitment",
  "auditRights",
  "securityExhibit",
  "bcdr",
  "subprocessorNotice",
  "dataPortability",
] as const;
const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

export function calculateVendorAssurance(input: Record<string, unknown>) {
  const controls = AI_VENDOR_CONTROLS.filter((key) => input[key] === true),
    score = Math.round((controls.length / AI_VENDOR_CONTROLS.length) * 100),
    gaps = AI_VENDOR_CONTROLS.filter((key) => input[key] !== true);
  const breachHours = Number(input.breachHours);
  const criticalGaps = [
    ...(input.dpa === true ? [] : ["dpa"]),
    ...(input.trainingOptOut === true ? [] : ["trainingOptOut"]),
    ...(input.deletionCommitment === true ? [] : ["deletionCommitment"]),
    ...(!Number.isFinite(breachHours) || breachHours > 72
      ? ["breachNotification"]
      : []),
  ];
  return {
    score,
    gaps,
    criticalGaps,
    tier: criticalGaps.length
      ? "High"
      : score >= 88
        ? "Low"
        : score >= 63
          ? "Medium"
          : "High",
  };
}
export function validateVendorAssessment(input: Record<string, unknown>) {
  const flags = Object.fromEntries(
    AI_VENDOR_CONTROLS.map((key) => [key, input[key] === true]),
  );
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    riskId: cleanAiText(input.riskId, 100),
    serviceName: redactSensitiveText(input.serviceName, 160),
    legalEntity: redactSensitiveText(input.legalEntity, 200),
    serviceOwner: redactSensitiveText(input.serviceOwner, 320),
    dataLocations: redactSensitiveText(input.dataLocations, 500),
    subprocessors: redactSensitiveText(input.subprocessors, 1200),
    certifications: redactSensitiveText(input.certifications, 800),
    sla: redactSensitiveText(input.sla, 800),
    exitPlan: redactSensitiveText(input.exitPlan, 1600),
    contractEnd: cleanAiText(input.contractEnd, 10),
    reviewDate: cleanAiText(input.reviewDate, 10),
    breachHours: Number(input.breachHours),
    ...flags,
  };
  if (
    !value.modelId ||
    value.serviceName.length < 2 ||
    value.legalEntity.length < 2 ||
    value.serviceOwner.length < 3 ||
    value.dataLocations.length < 2 ||
    value.sla.length < 5 ||
    value.exitPlan.length < 10
  )
    throw new Error(
      "AI hizmeti, tüzel kişi, sorumlu, veri lokasyonu, SLA ve çıkış planı zorunludur.",
    );
  if (!realDate(value.contractEnd) || !realDate(value.reviewDate))
    throw new Error("Sözleşme ve değerlendirme tarihleri geçersizdir.");
  if (
    !Number.isInteger(value.breachHours) ||
    value.breachHours < 1 ||
    value.breachHours > 168
  )
    throw new Error("İhlal bildirim süresi 1–168 saat arasında olmalıdır.");
  return { ...value, ...calculateVendorAssurance(value) };
}
export function vendorReviewState(
  status: string,
  reviewDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "suspended") return "suspended";
  if (reviewDate < today) return "overdue";
  const warning = new Date(`${today}T00:00:00Z`);
  warning.setUTCDate(warning.getUTCDate() + 30);
  return reviewDate <= warning.toISOString().slice(0, 10)
    ? "due-soon"
    : "current";
}
