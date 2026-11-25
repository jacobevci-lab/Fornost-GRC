import { cleanAiText, redactSensitiveText } from "./security";
export const AI_ACT_CLASSES = [
  "prohibited",
  "high-risk",
  "limited-risk",
  "minimal-risk",
  "gpai",
  "gpai-systemic",
] as const;
const realDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function regulatoryObligations(input: {
  classification: string;
  providerRole: boolean;
  deployerRole: boolean;
  personalData: boolean;
  automatedDecision: boolean;
  publicInteraction: boolean;
  highImpact: boolean;
}) {
  const items = [
    { key: "inventory", label: "AI envanteri ve amaç kaydı", required: true },
    {
      key: "risk-management",
      label: "Sürekli risk yönetimi",
      required:
        ["high-risk", "gpai-systemic"].includes(input.classification) ||
        input.highImpact,
    },
    {
      key: "data-governance",
      label: "Veri yönetişimi ve kalite",
      required: ["high-risk", "gpai", "gpai-systemic"].includes(
        input.classification,
      ),
    },
    {
      key: "technical-documentation",
      label: "Teknik dokümantasyon",
      required:
        input.providerRole ||
        ["high-risk", "gpai", "gpai-systemic"].includes(input.classification),
    },
    {
      key: "logging",
      label: "Loglama ve izlenebilirlik",
      required: input.classification === "high-risk",
    },
    {
      key: "human-oversight",
      label: "İnsan gözetimi ve override",
      required: input.classification === "high-risk" || input.automatedDecision,
    },
    {
      key: "transparency",
      label: "AI etkileşimi şeffaflığı",
      required:
        input.publicInteraction ||
        ["limited-risk", "gpai", "gpai-systemic"].includes(
          input.classification,
        ),
    },
    {
      key: "fundamental-rights",
      label: "Temel haklar etki değerlendirmesi",
      required: input.deployerRole && input.classification === "high-risk",
    },
    {
      key: "privacy",
      label: "KVKK/GDPR değerlendirmesi",
      required: input.personalData,
    },
    {
      key: "incident-reporting",
      label: "Ciddi olay bildirim süreci",
      required: ["high-risk", "gpai-systemic"].includes(input.classification),
    },
    {
      key: "copyright",
      label: "Telif politikası ve içerik özeti",
      required:
        input.providerRole &&
        ["gpai", "gpai-systemic"].includes(input.classification),
    },
  ];
  return items.filter((x) => x.required);
}
export function validateRegulatoryProfile(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    classification: cleanAiText(input.classification, 30),
    jurisdictions: redactSensitiveText(input.jurisdictions, 500),
    providerRole: input.providerRole === true,
    deployerRole: input.deployerRole === true,
    importerRole: input.importerRole === true,
    distributorRole: input.distributorRole === true,
    personalData: input.personalData === true,
    automatedDecision: input.automatedDecision === true,
    publicInteraction: input.publicInteraction === true,
    highImpact: input.highImpact === true,
    owner: redactSensitiveText(input.owner, 320),
    legalReviewer: redactSensitiveText(input.legalReviewer, 320),
    classificationRationale: redactSensitiveText(
      input.classificationRationale,
      1800,
    ),
    transparencyNotice: redactSensitiveText(input.transparencyNotice, 1800),
    humanOversight: redactSensitiveText(input.humanOversight, 1800),
    completedKeys: Array.isArray(input.completedKeys)
      ? input.completedKeys
          .map((x) => cleanAiText(x, 60))
          .filter(Boolean)
          .slice(0, 30)
      : [],
    reviewDate: cleanAiText(input.reviewDate, 10),
  };
  if (
    !value.modelId ||
    !AI_ACT_CLASSES.includes(
      value.classification as (typeof AI_ACT_CLASSES)[number],
    ) ||
    value.jurisdictions.length < 2 ||
    (!value.providerRole &&
      !value.deployerRole &&
      !value.importerRole &&
      !value.distributorRole) ||
    value.owner.length < 3 ||
    value.legalReviewer.length < 3 ||
    value.classificationRationale.length < 10 ||
    !realDate(value.reviewDate)
  )
    throw new Error(
      "Sınıflandırma, ülke kapsamı, ekonomik operatör rolü, sahipler, gerekçe ve inceleme tarihi zorunludur.",
    );
  if (value.classification === "prohibited")
    throw new Error("Yasaklı AI kullanımı onay akışına alınamaz.");
  if (value.publicInteraction && value.transparencyNotice.length < 10)
    throw new Error(
      "Kullanıcıyla etkileşen AI için şeffaflık bildirimi zorunludur.",
    );
  if (value.automatedDecision && value.humanOversight.length < 10)
    throw new Error(
      "Otomatik karar için insan gözetimi ve override planı zorunludur.",
    );
  const obligations = regulatoryObligations(value),
    required = obligations.map((x) => x.key),
    completed = [
      ...new Set(value.completedKeys.filter((x) => required.includes(x))),
    ],
    gaps = obligations
      .filter((x) => !completed.includes(x.key))
      .map((x) => x.label);
  return { ...value, obligations, completedKeys: completed, gaps };
}
export function regulatoryAttention(
  status: string,
  reviewDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "retired") return "retired";
  if (reviewDate < today) return "overdue";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return reviewDate <= d.toISOString().slice(0, 10) ? "due-soon" : "current";
}
