import { cleanAiText, redactSensitiveText } from "./security";

export const DATASET_PURPOSES = [
  "training",
  "fine-tuning",
  "evaluation",
  "rag",
  "monitoring",
] as const;
export const DATASET_SOURCES = [
  "internal",
  "customer",
  "vendor",
  "public",
  "synthetic",
] as const;
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const integer = (v: unknown, min: number, max: number, label: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${label} ${min}–${max} arasında olmalıdır.`);
  return n;
};
export function validateDataset(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    name: redactSensitiveText(input.name, 200),
    version: redactSensitiveText(input.version, 80),
    purpose: cleanAiText(input.purpose, 30),
    sourceType: cleanAiText(input.sourceType, 30),
    sourceOwner: redactSensitiveText(input.sourceOwner, 320),
    provenance: redactSensitiveText(input.provenance, 1800),
    license: redactSensitiveText(input.license, 300),
    legalBasis: redactSensitiveText(input.legalBasis, 800),
    dataClassification: cleanAiText(input.dataClassification, 30),
    personalData: input.personalData === true,
    specialCategory: input.specialCategory === true,
    consentRequired: input.consentRequired === true,
    consentVerified: input.consentVerified === true,
    retentionDays: integer(input.retentionDays, 1, 3650, "Saklama süresi"),
    records: integer(input.records, 0, 1_000_000_000, "Kayıt sayısı"),
    qualityScore: integer(input.qualityScore, 0, 100, "Kalite skoru"),
    biasScore: integer(input.biasScore, 0, 100, "Bias skoru"),
    documentation: redactSensitiveText(input.documentation, 1800),
    reviewDate: cleanAiText(input.reviewDate, 10),
  };
  if (
    !value.modelId ||
    value.name.length < 3 ||
    !value.version ||
    !DATASET_PURPOSES.includes(
      value.purpose as (typeof DATASET_PURPOSES)[number],
    ) ||
    !DATASET_SOURCES.includes(
      value.sourceType as (typeof DATASET_SOURCES)[number],
    ) ||
    value.sourceOwner.length < 3 ||
    value.provenance.length < 10 ||
    value.license.length < 2 ||
    value.legalBasis.length < 5 ||
    !["Public", "Internal", "Confidential", "Restricted"].includes(
      value.dataClassification,
    ) ||
    value.documentation.length < 10 ||
    !date(value.reviewDate)
  )
    throw new Error(
      "Veri seti kimliği, kaynak, lisans, hukuki dayanak, dokümantasyon ve inceleme tarihi zorunludur.",
    );
  if (value.specialCategory && !value.personalData)
    throw new Error(
      "Özel nitelikli veri, kişisel veri olarak işaretlenmelidir.",
    );
  if (value.consentRequired && !value.consentVerified)
    throw new Error("Gerekli açık rıza doğrulanmadan veri seti kaydedilemez.");
  return value;
}
export function datasetBlockers(v: {
  qualityScore: number;
  biasScore: number;
  provenance: string;
  license: string;
  legalBasis: string;
  personalData: boolean;
  specialCategory: boolean;
  consentRequired: boolean;
  consentVerified: boolean;
}) {
  const b: string[] = [];
  if (v.qualityScore < 70) b.push("Kalite skoru 70 altında");
  if (v.biasScore > 30) b.push("Bias riski 30 üzerinde");
  if (v.provenance.length < 10) b.push("Kaynak zinciri yetersiz");
  if (v.license.length < 2) b.push("Lisans tanımsız");
  if (v.legalBasis.length < 5) b.push("Hukuki dayanak yetersiz");
  if (v.consentRequired && !v.consentVerified) b.push("Açık rıza doğrulanmadı");
  if (v.specialCategory && !v.personalData)
    b.push("Özel nitelikli veri sınıflaması tutarsız");
  return b;
}
export function datasetAttention(
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
