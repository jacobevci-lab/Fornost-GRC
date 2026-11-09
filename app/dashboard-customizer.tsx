"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "./base-path";
import {
  cloneExecutiveDashboardPreferences as clone,
  normalizeExecutiveDashboardPreferences as normalize,
  EXECUTIVE_DASHBOARD_PRESETS,
  type ExecutiveDashboardPreferences as Preferences,
  type ExecutiveDashboardWidgetId as WidgetId,
} from "./executive-dashboard-preferences";
import "./dashboard-customizer.css";

export const PANEL_ORDER: WidgetId[] = ["riskHeatmap", "frameworkReadiness", "assuranceHealth", "auditRemediation"];
export function defaultDashboardView(): Preferences {
  return { ...clone(EXECUTIVE_DASHBOARD_PRESETS.executive), order: [...PANEL_ORDER, "actionCenter", "recentChanges"] };
}
export function useDashboardView() {
  const [preferences, setPreferences] = useState(defaultDashboardView);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath("/api/dashboard-preferences"), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("preferences");
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const loaded = payload.preferences ? normalize(payload.preferences) : defaultDashboardView();
        // The retired customizer persisted its default risk-first order. Migrate only
        // that untouched preset; preserve explicit visibility, density and ordering.
        const legacy = EXECUTIVE_DASHBOARD_PRESETS.executive;
        const isLegacyDefault = loaded.preset === "executive" && !loaded.compact
          && Object.values(loaded.visible).every(Boolean)
          && (loaded.order.join() === legacy.order.join() || loaded.order.join() === "frameworkReadiness,riskHeatmap,assuranceHealth,auditRemediation,actionCenter,recentChanges");
        setPreferences(isLegacyDefault ? defaultDashboardView() : loaded);
        setLoadFailed(false); setStatus("ready");
      }).catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); setStatus("error"); } });
    return () => controller.abort();
  }, [attempt]);
  const save = async (next: Preferences) => {
    if (loadFailed || status === "loading" || status === "saving") return false;
    setStatus("saving");
    try {
      const response = await fetch(withBasePath("/api/dashboard-preferences"), {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: normalize(next) }),
      });
      if (!response.ok) throw new Error("save");
      const payload = await response.json();
      setPreferences(normalize(payload.preferences)); setStatus("ready"); return true;
    } catch { setStatus("error"); return false; }
  };
  return { preferences, status, loadFailed, save, reload: () => { setStatus("loading"); retry(value => value + 1); } };
}

export default function DashboardHeaderActions({ lang, view, onAuditorPack, onReport }: {
  lang: "tr" | "en"; view: ReturnType<typeof useDashboardView>;
  onAuditorPack: () => void; onReport: () => void;
}) {
  const tr = lang === "tr";
  const dialog = useRef<HTMLDialogElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !group.current?.contains(event.target)) setExpanded(false);
    };
    const breakpoint = window.matchMedia("(max-width: 600px)");
    const reset = () => setExpanded(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    breakpoint.addEventListener("change", reset);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      breakpoint.removeEventListener("change", reset);
    };
  }, [expanded]);

  const closeActions = () => {
    if (expanded) toggle.current?.focus();
    setExpanded(false);
  };
  const [draft, setDraft] = useState(defaultDashboardView);
  const names: Record<WidgetId, string> = {
    frameworkReadiness: tr ? "Uyum portföyü" : "Compliance portfolio",
    riskHeatmap: tr ? "Risk görünümü" : "Risk posture",
    assuranceHealth: tr ? "Sürekli güvence" : "Continuous assurance",
    auditRemediation: tr ? "Denetim ve iyileştirme" : "Audit & remediation",
    actionCenter: tr ? "Karar tablosu" : "Decision board",
    recentChanges: tr ? "Yönetim dikkati" : "Attention signals",
  };
  const panels = draft.order.filter(id => PANEL_ORDER.includes(id));
  const move = (id: WidgetId, direction: number) => {
    const order = [...panels]; const index = order.indexOf(id); const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setDraft(current => ({ ...current, order: [...order, "actionCenter", "recentChanges"] }));
  };
  const close = () => dialog.current?.close();
  return <div className="executive-dashboard-header-actions">
    <div className="dashboard-action-group" ref={group} onKeyDown={event => {
      if (expanded && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeActions();
      }
    }}>
      <button type="button" ref={toggle} className="dashboard-actions-toggle" aria-controls="dashboard-action-list"
        aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {tr ? "İşlemler" : "Actions"}<span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
      <div id="dashboard-action-list" className="dashboard-action-list" data-expanded={expanded}>
        <button type="button" className="dashboard-customize-trigger" disabled={view.status === "loading"} onClick={() => { closeActions(); setDraft(clone(view.preferences)); dialog.current?.showModal(); }}>
          <span aria-hidden="true">⚙</span>{tr ? "Özelleştir" : "Customize"}
        </button>
        <button type="button" onClick={() => { closeActions(); onAuditorPack(); }}>{tr ? "Denetçi Paketi" : "Auditor Pack"}<span aria-hidden="true">↗</span></button>
        <button type="button" className="primary" onClick={() => { closeActions(); onReport(); }}>{tr ? "Yönetim Raporu" : "Executive Report"}<span aria-hidden="true">→</span></button>
      </div>
    </div>
    <dialog ref={dialog} className="dashboard-customizer-dialog" aria-labelledby="dashboard-customizer-title" onClick={event => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <header><div><h2 id="dashboard-customizer-title">{tr ? "Dashboard'u özelleştir" : "Customize dashboard"}</h2><p>{tr ? "Bölümleri seçin, kartların sırasını ve yoğunluğunu düzenleyin." : "Choose sections, arrange cards and adjust density."}</p></div><button type="button" onClick={close} aria-label={tr ? "Kapat" : "Close"}>×</button></header>
      <div className="dashboard-customizer-body">
        {view.status === "error" && <p role="alert">{view.loadFailed ? (tr ? "Hesap tercihleri yüklenemedi. Tekrar deneyin." : "Account preferences could not be loaded. Retry.") : (tr ? "Kaydedilemedi. Değişiklikleriniz uygulanmadı; tekrar deneyin." : "Save failed. Your changes were not applied; retry.")}{view.loadFailed && <button type="button" onClick={view.reload}>{tr ? "Tekrar yükle" : "Reload"}</button>}</p>}
        <div className="dashboard-profile"><label htmlFor="dashboard-profile-select">{tr ? "Görünüm" : "View"}</label><select id="dashboard-profile-select" value={draft.preset} onChange={event => {
          const id = event.target.value as Preferences["preset"];
          setDraft(id === "executive" ? defaultDashboardView() : { ...clone(EXECUTIVE_DASHBOARD_PRESETS[id]), order: [...PANEL_ORDER, "actionCenter", "recentChanges"] });
        }}><option value="executive">{tr ? "Yönetici" : "Executive"}</option><option value="risk">{tr ? "Risk odaklı" : "Risk focus"}</option><option value="assurance">{tr ? "Güvence odaklı" : "Assurance focus"}</option></select></div>
        <fieldset><legend>{tr ? "Özet kartları" : "Overview cards"}</legend>{panels.map((id, index) => <div className="dashboard-customizer-row" key={id}>
          <label><input type="checkbox" checked={draft.visible[id]} onChange={event => setDraft(current => ({ ...current, visible: { ...current.visible, [id]: event.target.checked } }))} />{names[id]}</label>
          <div><button type="button" disabled={index === 0} onClick={() => move(id, -1)} aria-label={`${names[id]} — ${tr ? "Yukarı taşı" : "Move up"}`}>↑</button><button type="button" disabled={index === panels.length - 1} onClick={() => move(id, 1)} aria-label={`${names[id]} — ${tr ? "Aşağı taşı" : "Move down"}`}>↓</button></div>
        </div>)}</fieldset>
        <fieldset><legend>{tr ? "Değerlendirme ayrıntıları" : "Assessment details"}</legend>{(["recentChanges", "actionCenter"] as WidgetId[]).map(id => <label className="dashboard-option" key={id}><input type="checkbox" checked={draft.visible[id]} onChange={event => setDraft(current => ({ ...current, visible: { ...current.visible, [id]: event.target.checked } }))} />{names[id]}</label>)}<label className="dashboard-option"><input type="checkbox" checked={draft.compact} onChange={event => setDraft(current => ({ ...current, compact: event.target.checked }))} />{tr ? "Kompakt yoğunluk" : "Compact density"}</label></fieldset>
        <p className="dashboard-save-note">{tr ? "Kaydettiğiniz düzen hesabınıza bağlıdır. KPI özeti her zaman görünür." : "Saved layouts belong to your account. The KPI summary remains visible."}</p>
      </div>
      <footer><button type="button" onClick={() => setDraft(defaultDashboardView())}>{tr ? "Varsayılana dön" : "Reset to default"}</button><button type="button" onClick={close}>{tr ? "İptal" : "Cancel"}</button><button type="button" className="primary" disabled={view.loadFailed || view.status === "loading" || view.status === "saving"} onClick={async () => { if (await view.save(draft)) close(); }}>{view.status === "saving" ? (tr ? "Kaydediliyor…" : "Saving…") : (tr ? "Görünümü kaydet" : "Save view")}</button></footer>
    </dialog>
  </div>;
}
