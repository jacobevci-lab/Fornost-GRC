export type FornostNavigationRequest = {
  module: string;
  ref?: string;
  kind?: string;
  source?: string;
  filter?: Record<string, string>;
};

export type FornostPendingFocus = FornostNavigationRequest & {
  createdAt: number;
};

export const FORNOST_FOCUS_EVENT = "fornost:focus";
export const FORNOST_PENDING_FOCUS_KEY = "fornost:pending-focus";

const NAV_LABELS: Record<string, string[]> = {
  "Ana Sayfa": ["Gösterge Paneli", "Dashboard"],
  "Benim İşlerim": ["Benim İşlerim", "My Work"],
  "Risk Assessment": ["Risk Değerlendirmesi", "Risk Assessment"],
  "Risk İştahı ve KRI": ["Risk İştahı ve KRI", "Risk Appetite & KRI"],
  BIA: ["İş Etki Analizi (BIA)", "Business Impact Analysis (BIA)"],
  "İş Sürekliliği": ["İş Sürekliliği ve Dayanıklılık", "Business Continuity & Resilience"],
  "Varlık Envanteri": ["Varlık Envanteri", "Asset Inventory"],
  Uyum: ["Uyum Yönetimi", "Compliance Management"],
  "Politika Merkezi": ["Politika Merkezi", "Policy Center"],
  Tedarikçiler: ["Tedarikçi Yönetimi", "Vendor Management"],
  Kontroller: ["Kontrol Kütüphanesi", "Control Library"],
  Kanıtlar: ["Kanıt Kütüphanesi", "Evidence Library"],
  "Kanıt Otomasyonu": ["Kanıt Otomasyonu", "Evidence Automation"],
  "Regülasyon Merkezi": ["Regülasyon Merkezi", "Regulatory Change Center"],
  "Güvenlik Olayları": ["Güvenlik Olayları ve Kriz", "Security Incidents & Crisis"],
  "Bulgular ve CAPA": ["Bulgular ve CAPA", "Findings & CAPA"],
  "Denetim Yönetimi": ["Denetim Yönetimi", "Audit Management"],
  "Bağlantılı GRC": ["Bağlantılı GRC Haritası", "Connected GRC Map"],
  Raporlar: ["Raporlama", "Reporting"],
  "AI Yönetişimi": ["AI Yönetişimi", "AI Governance"],
  "Ask Fornost": ["Ask Fornost"],
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");

function matchingNavigationButton(module: string) {
  if (typeof document === "undefined") return null;
  const labels = NAV_LABELS[module] || [module];
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button[aria-label]"));
  return buttons.find((button) => labels.some((label) => normalized(button.getAttribute("aria-label")).includes(normalized(label)))) || null;
}

function rememberFocus(request: FornostNavigationRequest) {
  if (typeof window === "undefined") return;
  const pending: FornostPendingFocus = { ...request, createdAt: Date.now() };
  try {
    window.sessionStorage.setItem(FORNOST_PENDING_FOCUS_KEY, JSON.stringify(pending));
  } catch {}
}

function dispatchFocus(request: FornostNavigationRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FornostNavigationRequest>(FORNOST_FOCUS_EVENT, { detail: request }));
}

export function navigateToFornost(request: FornostNavigationRequest | string) {
  if (typeof window === "undefined") return false;
  const target = typeof request === "string" ? { module: request } : request;
  if (!clean(target.module)) return false;

  rememberFocus(target);
  const button = matchingNavigationButton(target.module);
  button?.click();

  // Module content can mount after the navigation state changes. Emit immediately
  // for already-mounted consumers and once more after the current render turn.
  dispatchFocus(target);
  window.setTimeout(() => dispatchFocus(target), 0);
  return Boolean(button);
}

export function peekPendingFornostFocus(maxAgeMs = 30_000): FornostPendingFocus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FORNOST_PENDING_FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FornostPendingFocus;
    if (!parsed || !clean(parsed.module) || !Number.isFinite(parsed.createdAt)) return null;
    if (Date.now() - parsed.createdAt > maxAgeMs) {
      window.sessionStorage.removeItem(FORNOST_PENDING_FOCUS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingFornostFocus(module?: string, maxAgeMs = 30_000): FornostPendingFocus | null {
  const pending = peekPendingFornostFocus(maxAgeMs);
  if (!pending) return null;
  if (module && normalized(pending.module) !== normalized(module)) return null;
  try {
    window.sessionStorage.removeItem(FORNOST_PENDING_FOCUS_KEY);
  } catch {}
  return pending;
}
