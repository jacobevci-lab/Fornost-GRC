"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Lang = "tr" | "en";

const STORAGE_KEY = "fornost:dashboard:v8-analysis";

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function initialAnalysisState() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export default function DashboardV8Focus() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [analysisOpen, setAnalysisOpen] = useState(initialAnalysisState);

  useEffect(() => {
    const discover = () => {
      const dashboard = document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4");
      if (!dashboard) return;
      dashboard.classList.add("fornost-dashboard-v8");
      setRoot(current => current === dashboard ? current : dashboard);
      const nextToolbar = dashboard.querySelector<HTMLElement>(".ed4-toolbar");
      setToolbar(current => current === nextToolbar ? current : nextToolbar);
      setLang(currentLanguage());
    };

    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = () => setLang(currentLanguage());
    document.addEventListener("click", onClick);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.querySelector(".workspace-dashboard.fornost-dashboard-v8")?.classList.remove("fornost-dashboard-v8", "ed8-analysis-open");
    };
  }, []);

  useEffect(() => {
    if (!root) return;
    root.classList.toggle("ed8-analysis-open", analysisOpen);
    try {
      window.localStorage.setItem(STORAGE_KEY, analysisOpen ? "open" : "closed");
    } catch {}
  }, [root, analysisOpen]);

  if (!toolbar) return null;
  const tr = lang === "tr";

  return createPortal(
    <button
      type="button"
      className={`ed8-analysis-toggle${analysisOpen ? " active" : ""}`}
      aria-pressed={analysisOpen}
      onClick={() => setAnalysisOpen(value => !value)}
      title={tr ? "Risk ısı haritası ve değişim analizlerini göster/gizle" : "Show or hide risk heatmap and change analysis"}
    >
      <span aria-hidden="true">⌁</span>
      {analysisOpen ? (tr ? "Analizi gizle" : "Hide analysis") : (tr ? "Analiz" : "Analysis")}
    </button>,
    toolbar,
  );
}
