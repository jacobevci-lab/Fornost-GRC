"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import "./dashboard-data-integrity.css";

type Lang = "tr" | "en";
type SourceState = "idle" | "checking" | "ok" | "error";
type SourceId = "platform" | "grc" | "findings" | "appetite";
type SourceStatus = {
  id: SourceId;
  state: SourceState;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: number | null;
  lastSuccessAt: number | null;
};

type IntegrityState = "checking" | "live" | "degraded" | "stale" | "offline";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

const SOURCES: Array<{
  id: SourceId;
  endpoint: string;
  tr: string;
  en: string;
  critical: boolean;
}> = [
  { id: "platform", endpoint: "/api/health", tr: "Platform sağlığı", en: "Platform health", critical: true },
  { id: "grc", endpoint: "/api/grc", tr: "GRC kayıtları", en: "GRC records", critical: true },
  { id: "findings", endpoint: "/api/findings", tr: "Bulgu & CAPA", en: "Findings & CAPA", critical: false },
  { id: "appetite", endpoint: "/api/risk-appetite", tr: "Risk iştahı & KRI", en: "Risk appetite & KRI", critical: false },
];

const initialStatuses = (): Record<SourceId, SourceStatus> => ({
  platform: { id: "platform", state: "idle", httpStatus: null, latencyMs: null, checkedAt: null, lastSuccessAt: null },
  grc: { id: "grc", state: "idle", httpStatus: null, latencyMs: null, checkedAt: null, lastSuccessAt: null },
  findings: { id: "findings", state: "idle", httpStatus: null, latencyMs: null, checkedAt: null, lastSuccessAt: null },
  appetite: { id: "appetite", state: "idle", httpStatus: null, latencyMs: null, checkedAt: null, lastSuccessAt: null },
});

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function dashboardVisible() {
  return document.visibilityState === "visible" && Boolean(document.querySelector(".workspace-dashboard.fornost-dashboard-v4 .ed4-shell"));
}

function formatClock(value: number | null, lang: Lang) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function DashboardDataIntegrity() {
  const [toolbarMount, setToolbarMount] = useState<HTMLElement | null>(null);
  const [bannerMount, setBannerMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [statuses, setStatuses] = useState<Record<SourceId, SourceStatus>>(() => initialStatuses());
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);

  const checkAll = useCallback(async () => {
    if (!dashboardVisible()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      return;
    }

    setOnline(true);
    setChecking(true);
    const now = Date.now();
    setStatuses(current => {
      const next = { ...current };
      for (const source of SOURCES) next[source.id] = { ...next[source.id], state: "checking" };
      return next;
    });

    const results = await Promise.all(SOURCES.map(async source => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const started = performance.now();
      try {
        const response = await fetch(withBasePath(source.endpoint), {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        return {
          id: source.id,
          ok: response.ok,
          httpStatus: response.status,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
        };
      } catch {
        return {
          id: source.id,
          ok: false,
          httpStatus: null,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
        };
      } finally {
        window.clearTimeout(timeout);
      }
    }));

    setStatuses(current => {
      const next = { ...current };
      for (const result of results) {
        const previous = next[result.id];
        next[result.id] = {
          ...previous,
          state: result.ok ? "ok" : "error",
          httpStatus: result.httpStatus,
          latencyMs: result.latencyMs,
          checkedAt: now,
          lastSuccessAt: result.ok ? now : previous.lastSuccessAt,
        };
      }
      return next;
    });
    setChecking(false);
  }, []);

  useEffect(() => {
    let createdToolbar: HTMLSpanElement | null = null;
    let createdBanner: HTMLDivElement | null = null;

    const discover = () => {
      setLang(currentLanguage());
      const shell = document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4 .ed4-shell");
      if (!shell) return;

      const controls = shell.querySelector<HTMLElement>(".ed4-toolbar-controls");
      const toolbar = shell.querySelector<HTMLElement>(".ed4-toolbar");
      if (controls) {
        createdToolbar = controls.querySelector<HTMLSpanElement>(":scope > .eddi-toolbar-mount");
        if (!createdToolbar) {
          createdToolbar = document.createElement("span");
          createdToolbar.className = "eddi-toolbar-mount";
          controls.appendChild(createdToolbar);
        }
        setToolbarMount(createdToolbar);
      }

      if (toolbar) {
        createdBanner = shell.querySelector<HTMLDivElement>(":scope > .eddi-banner-mount");
        if (!createdBanner) {
          createdBanner = document.createElement("div");
          createdBanner.className = "eddi-banner-mount";
          toolbar.insertAdjacentElement("afterend", createdBanner);
        }
        setBannerMount(createdBanner);
      }
    };

    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });

    const onDocumentClick = () => setLang(currentLanguage());
    document.addEventListener("click", onDocumentClick);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick);
      createdToolbar?.remove();
      createdBanner?.remove();
    };
  }, []);

  useEffect(() => {
    if (!toolbarMount) return;
    void checkAll();

    const timer = window.setInterval(() => void checkAll(), CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (dashboardVisible()) void checkAll();
    };
    const onOnline = () => {
      setOnline(true);
      void checkAll();
    };
    const onOffline = () => setOnline(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [toolbarMount, checkAll]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".eddi-popover, .eddi-trigger")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const summary = useMemo(() => {
    const values = SOURCES.map(source => ({ source, status: statuses[source.id] }));
    const okCount = values.filter(item => item.status.state === "ok").length;
    const criticalError = values.some(item => item.source.critical && item.status.state === "error");
    const anyError = values.some(item => item.status.state === "error");
    const coreLastSuccess = statuses.grc.lastSuccessAt;
    const stale = Boolean(coreLastSuccess && Date.now() - coreLastSuccess > STALE_AFTER_MS);
    let state: IntegrityState = "checking";
    if (!online) state = "offline";
    else if (stale) state = "stale";
    else if (criticalError || anyError) state = "degraded";
    else if (okCount === SOURCES.length) state = "live";
    return { state, okCount, coreLastSuccess, values };
  }, [statuses, online]);

  if (!toolbarMount) return null;
  const tr = lang === "tr";
  const stateLabel = summary.state === "live" ? (tr ? "Canlı" : "Live")
    : summary.state === "degraded" ? (tr ? "Kısmi" : "Degraded")
      : summary.state === "stale" ? (tr ? "Eski veri" : "Stale")
        : summary.state === "offline" ? (tr ? "Çevrimdışı" : "Offline")
          : (tr ? "Kontrol ediliyor" : "Checking");

  const toolbar = createPortal(<>
    <button
      type="button"
      className={`eddi-trigger ${summary.state}`}
      onClick={() => setOpen(value => !value)}
      aria-expanded={open}
      aria-haspopup="dialog"
      title={tr ? "Dashboard veri kaynağı sağlığını göster" : "Show dashboard data source health"}
    >
      <i aria-hidden="true" />
      <span>{stateLabel}</span>
      <b>{summary.okCount}/{SOURCES.length}</b>
    </button>
    {open && <section className="eddi-popover" role="dialog" aria-label={tr ? "Dashboard veri bütünlüğü" : "Dashboard data integrity"}>
      <header>
        <div>
          <small>FORNOST GRC · DATA INTEGRITY</small>
          <h3>{tr ? "Canlı veri kaynakları" : "Live data sources"}</h3>
          <p>{tr ? "Dashboard kararlarının beslendiği kaynakların erişilebilirlik ve tazelik durumu." : "Availability and freshness of the sources feeding executive dashboard decisions."}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={tr ? "Kapat" : "Close"}>×</button>
      </header>
      <div className="eddi-source-list">
        {summary.values.map(({ source, status }) => <div className={`eddi-source ${status.state}`} key={source.id}>
          <i aria-hidden="true" />
          <span>
            <b>{tr ? source.tr : source.en}</b>
            <small>{status.state === "checking" ? (tr ? "Kontrol ediliyor" : "Checking") : status.state === "ok" ? (tr ? "Erişilebilir" : "Available") : status.state === "error" ? (tr ? "Erişim hatası" : "Unavailable") : (tr ? "Bekleniyor" : "Pending")}</small>
          </span>
          <em>{status.httpStatus ?? "—"}</em>
          <strong>{status.latencyMs === null ? "—" : `${status.latencyMs} ms`}</strong>
        </div>)}
      </div>
      <footer>
        <span>{tr ? "Son başarılı GRC okuması" : "Last successful GRC read"}: <b>{formatClock(summary.coreLastSuccess, lang)}</b></span>
        <button type="button" onClick={() => void checkAll()} disabled={checking}>{checking ? "…" : "↻"} {tr ? "Tekrar kontrol et" : "Check again"}</button>
      </footer>
    </section>}
  </>, toolbarMount);

  const showBanner = summary.state === "degraded" || summary.state === "stale" || summary.state === "offline";
  const banner = bannerMount && showBanner ? createPortal(
    <div className={`eddi-banner ${summary.state}`} role="status">
      <span>
        <i aria-hidden="true" />
        <b>{summary.state === "offline" ? (tr ? "Bağlantı yok" : "Offline") : summary.state === "stale" ? (tr ? "Dashboard verisi güncelliğini kaybetti" : "Dashboard data is stale") : (tr ? "Bazı dashboard veri kaynakları erişilemiyor" : "Some dashboard data sources are unavailable")}</b>
        <small>{tr ? "Karar vermeden önce veri bütünlüğünü doğrulayın veya yeniden deneyin." : "Verify data integrity or retry before relying on the dashboard for a decision."}</small>
      </span>
      <button type="button" onClick={() => { setOpen(true); void checkAll(); }}>{tr ? "Kaynakları kontrol et" : "Check sources"} →</button>
    </div>,
    bannerMount,
  ) : null;

  return <>{toolbar}{banner}</>;
}
