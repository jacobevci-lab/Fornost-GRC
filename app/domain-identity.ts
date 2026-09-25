export const DOMAIN_MODULE_KEYS = [
  "dashboard",
  "my-work",
  "risk",
  "risk-appetite",
  "bia",
  "business-continuity",
  "asset",
  "compliance",
  "policy",
  "vendor",
  "control",
  "evidence",
  "evidence-automation",
  "regulatory",
  "incident",
  "finding",
  "audit",
  "connected-grc",
  "reporting",
  "ai-governance",
  "ask-fornost",
] as const;

export type DomainModuleKey = typeof DOMAIN_MODULE_KEYS[number];

export const DOMAIN_STATUS_KEYS = [
  "open",
  "in-progress",
  "under-review",
  "planned",
  "active",
  "inactive",
  "completed",
  "closed",
  "accepted",
  "verification",
  "compliant",
  "partially-compliant",
  "non-compliant",
  "needs-improvement",
  "not-tested",
  "draft",
  "approved",
  "published",
  "expired",
  "overdue",
] as const;

export type DomainStatusKey = typeof DOMAIN_STATUS_KEYS[number];

type ModuleIdentity = {
  key: DomainModuleKey;
  legacy: string;
  tr: string;
  en: string;
  aliases?: string[];
};

type StatusIdentity = {
  key: DomainStatusKey;
  tr: string;
  en: string;
  aliases?: string[];
};

export const DOMAIN_MODULES: readonly ModuleIdentity[] = [
  { key: "dashboard", legacy: "Ana Sayfa", tr: "Ana Sayfa", en: "Dashboard", aliases: ["Gösterge Paneli"] },
  { key: "my-work", legacy: "Benim İşlerim", tr: "Benim İşlerim", en: "My Work" },
  { key: "risk", legacy: "Risk Assessment", tr: "Risk Değerlendirmesi", en: "Risk Assessment" },
  { key: "risk-appetite", legacy: "Risk İştahı ve KRI", tr: "Risk İştahı ve KRI", en: "Risk Appetite & KRI" },
  { key: "bia", legacy: "BIA", tr: "İş Etki Analizi (BIA)", en: "Business Impact Analysis (BIA)" },
  { key: "business-continuity", legacy: "İş Sürekliliği", tr: "İş Sürekliliği ve Dayanıklılık", en: "Business Continuity & Resilience" },
  { key: "asset", legacy: "Varlık Envanteri", tr: "Varlık Envanteri", en: "Asset Inventory" },
  { key: "compliance", legacy: "Uyum", tr: "Uyum Yönetimi", en: "Compliance Management" },
  { key: "policy", legacy: "Politika Merkezi", tr: "Politika Merkezi", en: "Policy Center" },
  { key: "vendor", legacy: "Tedarikçiler", tr: "Tedarikçi Yönetimi", en: "Vendor Management" },
  { key: "control", legacy: "Kontroller", tr: "Kontrol Kütüphanesi", en: "Control Library" },
  { key: "evidence", legacy: "Kanıtlar", tr: "Kanıt Kütüphanesi", en: "Evidence Library" },
  { key: "evidence-automation", legacy: "Kanıt Otomasyonu", tr: "Kanıt Otomasyonu", en: "Evidence Automation" },
  { key: "regulatory", legacy: "Regülasyon Merkezi", tr: "Regülasyon Merkezi", en: "Regulatory Change Center" },
  { key: "incident", legacy: "Güvenlik Olayları", tr: "Güvenlik Olayları ve Kriz", en: "Security Incidents & Crisis" },
  { key: "finding", legacy: "Bulgular ve CAPA", tr: "Bulgular ve CAPA", en: "Findings & CAPA" },
  { key: "audit", legacy: "Denetim Yönetimi", tr: "Denetim Yönetimi", en: "Audit Management" },
  { key: "connected-grc", legacy: "Bağlantılı GRC", tr: "Bağlantılı GRC Haritası", en: "Connected GRC Map" },
  { key: "reporting", legacy: "Raporlar", tr: "Raporlama", en: "Reporting" },
  { key: "ai-governance", legacy: "AI Yönetişimi", tr: "AI Yönetişimi", en: "AI Governance" },
  { key: "ask-fornost", legacy: "Ask Fornost", tr: "Ask Fornost", en: "Ask Fornost" },
] as const;

export const DOMAIN_STATUSES: readonly StatusIdentity[] = [
  { key: "open", tr: "Açık", en: "Open", aliases: ["open"] },
  { key: "in-progress", tr: "Devam Ediyor", en: "In Progress", aliases: ["in-progress", "in progress"] },
  { key: "under-review", tr: "Değerlendiriliyor", en: "Under Review", aliases: ["under-review", "under review", "review"] },
  { key: "planned", tr: "Planlandı", en: "Planned", aliases: ["planned"] },
  { key: "active", tr: "Aktif", en: "Active", aliases: ["active"] },
  { key: "inactive", tr: "Pasif", en: "Inactive", aliases: ["inactive"] },
  { key: "completed", tr: "Tamamlandı", en: "Completed", aliases: ["completed", "done"] },
  { key: "closed", tr: "Kapatıldı", en: "Closed", aliases: ["closed", "kapalı"] },
  { key: "accepted", tr: "Kabul Edildi", en: "Accepted", aliases: ["accepted", "risk accepted"] },
  { key: "verification", tr: "Doğrulamada", en: "Verification", aliases: ["verification"] },
  { key: "compliant", tr: "Uyumlu", en: "Compliant", aliases: ["compliant"] },
  { key: "partially-compliant", tr: "Kısmen Uyumlu", en: "Partially Compliant", aliases: ["partially compliant", "partial"] },
  { key: "non-compliant", tr: "Uyumlu Değil", en: "Non-Compliant", aliases: ["non-compliant", "non compliant"] },
  { key: "needs-improvement", tr: "İyileştirme Gerekli", en: "Needs Improvement", aliases: ["needs improvement", "needs-improvement"] },
  { key: "not-tested", tr: "Test Edilmedi", en: "Not Tested", aliases: ["not tested", "not-tested"] },
  { key: "draft", tr: "Taslak", en: "Draft", aliases: ["draft"] },
  { key: "approved", tr: "Onaylandı", en: "Approved", aliases: ["approved"] },
  { key: "published", tr: "Yayınlandı", en: "Published", aliases: ["published"] },
  { key: "expired", tr: "Süresi Doldu", en: "Expired", aliases: ["expired"] },
  { key: "overdue", tr: "Gecikmiş", en: "Overdue", aliases: ["overdue"] },
] as const;

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase("tr-TR");

const moduleIndex = new Map<string, ModuleIdentity>();
for (const module of DOMAIN_MODULES) {
  for (const candidate of [module.key, module.legacy, module.tr, module.en, ...(module.aliases || [])]) {
    moduleIndex.set(normalize(candidate), module);
  }
}

const statusIndex = new Map<string, StatusIdentity>();
for (const status of DOMAIN_STATUSES) {
  for (const candidate of [status.key, status.tr, status.en, ...(status.aliases || [])]) {
    statusIndex.set(normalize(candidate), status);
  }
}

export function domainModuleKey(value: unknown): DomainModuleKey | null {
  return moduleIndex.get(normalize(value))?.key || null;
}

export function legacyModuleName(value: unknown): string | null {
  return moduleIndex.get(normalize(value))?.legacy || null;
}

export function domainModuleLabel(value: unknown, lang: "tr" | "en") {
  const identity = moduleIndex.get(normalize(value));
  if (!identity) return String(value ?? "").trim();
  return identity[lang];
}

export function domainModuleSearchLabels(value: unknown) {
  const identity = moduleIndex.get(normalize(value));
  if (!identity) return [String(value ?? "").trim()].filter(Boolean);
  return [...new Set([identity.legacy, identity.tr, identity.en, ...(identity.aliases || [])])];
}

export function domainStatusKey(value: unknown): DomainStatusKey | null {
  return statusIndex.get(normalize(value))?.key || null;
}

export function domainStatusLabel(value: unknown, lang: "tr" | "en") {
  const identity = statusIndex.get(normalize(value));
  if (!identity) return String(value ?? "").trim();
  return identity[lang];
}

export function sameDomainModule(left: unknown, right: unknown) {
  const leftKey = domainModuleKey(left);
  const rightKey = domainModuleKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function sameDomainStatus(left: unknown, right: unknown) {
  const leftKey = domainStatusKey(left);
  const rightKey = domainStatusKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
