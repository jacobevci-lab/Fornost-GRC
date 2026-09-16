import { cleanAiText, redactSensitiveText } from "./security";

export const AI_OBLIGATION_FRAMEWORKS = [
  "EU AI Act",
  "ISO/IEC 42001",
  "NIST AI RMF",
  "KVKK/GDPR",
  "Internal Policy",
] as const;
export const AI_OBLIGATION_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function validateAiObligation(
  input: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    profileId: cleanAiText(input.profileId, 100),
    framework: cleanAiText(input.framework, 40),
    obligationCode: cleanAiText(input.obligationCode, 80),
    title: redactSensitiveText(input.title, 240),
    description: redactSensitiveText(input.description, 2000),
    owner: redactSensitiveText(input.owner, 320),
    reviewer: redactSensitiveText(input.reviewer, 320),
    dueDate: cleanAiText(input.dueDate, 10),
    priority: cleanAiText(input.priority, 20),
    evidencePlan: redactSensitiveText(input.evidencePlan, 1600),
    recurringDays: Math.round(Number(input.recurringDays || 0)),
  };
  if (!value.modelId || !AI_OBLIGATION_FRAMEWORKS.includes(value.framework as (typeof AI_OBLIGATION_FRAMEWORKS)[number]))
    throw new Error("AI modeli ve desteklenen yükümlülük çerçevesi zorunludur.");
  if (value.obligationCode.length < 2 || value.title.length < 5 || value.description.length < 20)
    throw new Error("Yükümlülük kodu, başlığı ve açıklaması eksiksiz girilmelidir.");
  if (value.owner.length < 3 || value.reviewer.length < 3 || value.owner === value.reviewer)
    throw new Error("Birbirinden farklı yükümlülük sahibi ve bağımsız doğrulayıcı zorunludur.");
  if (!realDate(value.dueDate) || value.dueDate < today)
    throw new Error("Bugün veya ileri tarihli yükümlülük tarihi zorunludur.");
  if (!AI_OBLIGATION_PRIORITIES.includes(value.priority as (typeof AI_OBLIGATION_PRIORITIES)[number]))
    throw new Error("Geçerli yükümlülük önceliği zorunludur.");
  if (value.evidencePlan.length < 10)
    throw new Error("Kanıt toplama ve doğrulama planı zorunludur.");
  if (value.recurringDays < 0 || value.recurringDays > 3650)
    throw new Error("Tekrar süresi 0-3650 gün arasında olmalıdır.");
  return value;
}

export function validateObligationAction(input: Record<string, unknown>) {
  const action = cleanAiText(input.action, 20),
    note = redactSensitiveText(input.note, 1200),
    confirmation = cleanAiText(input.confirmation, 40),
    evidenceReference = redactSensitiveText(input.evidenceReference, 300),
    evidenceSha256 = cleanAiText(input.evidenceSha256, 64).toLowerCase();
  if (!['start', 'submit', 'verify', 'reopen'].includes(action) || note.length < 10)
    throw new Error("Geçerli yükümlülük işlemi ve açıklama zorunludur.");
  const expected: Record<string, string> = {
    start: "YÜKÜMLÜLÜĞÜ BAŞLAT",
    submit: "DOĞRULAMAYA GÖNDER",
    verify: "YÜKÜMLÜLÜĞÜ DOĞRULA",
    reopen: "YÜKÜMLÜLÜĞÜ YENİDEN AÇ",
  };
  if (confirmation !== expected[action]) throw new Error(`Onay metni: ${expected[action]}`);
  if (["submit", "verify"].includes(action) && (evidenceReference.length < 5 || !/^[a-f0-9]{64}$/.test(evidenceSha256)))
    throw new Error("Kanıt referansı ve geçerli SHA-256 özeti zorunludur.");
  return { action, note, evidenceReference, evidenceSha256 };
}

export function obligationAttention(
  status: string,
  priority: string,
  dueDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status !== "completed" && dueDate < today) return "overdue";
  if (status !== "completed" && ["High", "Critical"].includes(priority)) return "priority";
  return status;
}
