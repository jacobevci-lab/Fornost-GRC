"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import {
  EXECUTIVE_DASHBOARD_PRESETS,
  EXECUTIVE_DASHBOARD_STORAGE_KEY,
  cloneExecutiveDashboardPreferences,
  executiveDashboardPreferencesFingerprint,
  normalizeExecutiveDashboardPreferences,
  type ExecutiveDashboardPreferences,
} from "./executive-dashboard-preferences";
import "./executive-dashboard-preference-sync.css";

type SyncState = "loading" | "saving" | "synced" | "local";
type PreferenceApiPayload = {
  preferences?: unknown;
  source?: "account" | "default";
  updatedAt?: string | null;
};

const RELOAD_GUARD_KEY = "fornost:executive-dashboard:account-layout-applied";

function readLocalPreferences(): ExecutiveDashboardPreferences {
  try {
    const value = window.localStorage.getItem(EXECUTIVE_DASHBOARD_STORAGE_KEY);
    return value
      ? normalizeExecutiveDashboardPreferences(JSON.parse(value))
      : cloneExecutiveDashboardPreferences(EXECUTIVE_DASHBOARD_PRESETS.executive);
  } catch {
    return cloneExecutiveDashboardPreferences(EXECUTIVE_DASHBOARD_PRESETS.executive);
  }
}

function writeLocalPreferences(preferences: ExecutiveDashboardPreferences) {
  window.localStorage.setItem(EXECUTIVE_DASHBOARD_STORAGE_KEY, JSON.stringify(preferences));
}

function language() {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

export default function ExecutiveDashboardPreferenceSync() {
  const [state, setState] = useState<SyncState>("loading");
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const lastSynced = useRef("");
  const enabled = useRef(true);
  const inFlight = useRef(false);

  const save = useCallback(async (preferences: ExecutiveDashboardPreferences) => {
    const fingerprint = executiveDashboardPreferencesFingerprint(preferences);
    if (!enabled.current || inFlight.current || fingerprint === lastSynced.current) return;
    inFlight.current = true;
    setState("saving");
    try {
      const response = await fetch(withBasePath("/api/dashboard-preferences"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      if (response.status === 401 || response.status === 403) {
        enabled.current = false;
        setState("local");
        return;
      }
      if (!response.ok) {
        setState("local");
        return;
      }
      const payload = (await response.json()) as PreferenceApiPayload;
      const saved = normalizeExecutiveDashboardPreferences(payload.preferences ?? preferences);
      writeLocalPreferences(saved);
      lastSynced.current = executiveDashboardPreferencesFingerprint(saved);
      setState("synced");
    } catch {
      setState("local");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      try {
        const response = await fetch(withBasePath("/api/dashboard-preferences"), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          enabled.current = false;
          setState("local");
          return;
        }
        if (!response.ok) {
          setState("local");
          return;
        }

        const payload = (await response.json()) as PreferenceApiPayload;
        const localPreferences = readLocalPreferences();
        if (!payload.preferences) {
          await save(localPreferences);
          return;
        }

        const accountPreferences = normalizeExecutiveDashboardPreferences(payload.preferences);
        const accountFingerprint = executiveDashboardPreferencesFingerprint(accountPreferences);
        const localFingerprint = executiveDashboardPreferencesFingerprint(localPreferences);
        lastSynced.current = accountFingerprint;
        if (accountFingerprint !== localFingerprint) {
          writeLocalPreferences(accountPreferences);
          const reloadToken = `${payload.updatedAt ?? "account"}:${accountFingerprint}`;
          if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) !== reloadToken) {
            window.sessionStorage.setItem(RELOAD_GUARD_KEY, reloadToken);
            window.location.reload();
            return;
          }
        }
        setState("synced");
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setState("local");
      }
    });
    return () => controller.abort();
  }, [save]);

  useEffect(() => {
    const discover = () => {
      const footer = document.querySelector<HTMLElement>(".ed4-customizer footer");
      setFooterHost((current) => (current === footer ? current : footer));
      setLang(language());
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = (event: MouseEvent) => {
      setLang(language());
      const target = event.target as Element | null;
      if (!target?.closest(".ed4-customizer")) return;
      window.setTimeout(() => void save(readLocalPreferences()), 180);
    };
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, [save]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EXECUTIVE_DASHBOARD_STORAGE_KEY || !event.newValue) return;
      try {
        void save(normalizeExecutiveDashboardPreferences(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed values from another browser tab.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [save]);

  if (!footerHost) return null;
  const tr = lang === "tr";
  const label = state === "synced"
    ? (tr ? "Hesapla eşitlendi" : "Synced to account")
    : state === "saving"
      ? (tr ? "Hesaba kaydediliyor…" : "Saving to account…")
      : state === "loading"
        ? (tr ? "Hesap görünümü yükleniyor…" : "Loading account view…")
        : (tr ? "Yerel yedek aktif" : "Local fallback active");

  return createPortal(
    <span className={`ed4-preference-sync ${state}`} aria-live="polite" title={tr ? "Dashboard düzeni kullanıcı hesabınıza bağlıdır." : "Dashboard layout is scoped to your user account."}>
      <i aria-hidden="true" />{label}
    </span>,
    footerHost,
  );
}
