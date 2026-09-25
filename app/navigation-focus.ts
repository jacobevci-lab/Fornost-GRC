import { domainModuleSearchLabels, sameDomainModule } from "./domain-identity";

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

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");

function matchingNavigationButton(module: string) {
  if (typeof document === "undefined") return null;
  const labels = domainModuleSearchLabels(module);
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
  if (module && !sameDomainModule(pending.module, module)) return null;
  try {
    window.sessionStorage.removeItem(FORNOST_PENDING_FOCUS_KEY);
  } catch {}
  return pending;
}
