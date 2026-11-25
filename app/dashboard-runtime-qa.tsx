"use client";

import { useEffect } from "react";

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function dashboardVisible() {
  return document.visibilityState === "visible" && Boolean(document.querySelector(".workspace-dashboard.fornost-dashboard-v4 .ed4-shell"));
}

function refreshDashboard() {
  if (!dashboardVisible()) return;
  const refresh = document.querySelector<HTMLButtonElement>(".ed4-refresh");
  if (refresh && !refresh.disabled) refresh.click();
}

function openUnassignedAnalysis(lang: "tr" | "en") {
  const prompt = lang === "tr"
    ? "Dashboard'daki atanmamış aktif yönetişim kayıtlarını modüle göre grupla. Risk, kontrol, denetim ve bulgular için kayıt, öncelik, termin ve önerilen sorumlu rolü göster; önce kritik ve gecikmiş olanları sırala."
    : "List active unassigned governance records from the dashboard grouped by module. For risks, controls, audits and findings show record, priority, due date and suggested owner role; put critical and overdue items first.";

  window.dispatchEvent(new CustomEvent("fornost:open-ai", {
    detail: { module: "Dashboard", prompt, mode: "agent", agentKind: "reporting" },
  }));
}

export default function DashboardRuntimeQa() {
  useEffect(() => {
    let lastAutoRefresh = Date.now();

    const interval = window.setInterval(() => {
      if (!dashboardVisible()) return;
      lastAutoRefresh = Date.now();
      refreshDashboard();
    }, AUTO_REFRESH_MS);

    const onVisibility = () => {
      if (!dashboardVisible()) return;
      if (Date.now() - lastAutoRefresh < AUTO_REFRESH_MS) return;
      lastAutoRefresh = Date.now();
      refreshDashboard();
    };

    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest<HTMLButtonElement>(".ed4-action-counters button:nth-child(4)");
      if (!button) return;
      event.preventDefault();
      const lang = document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
      openUnassignedAnalysis(lang);
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onClick, true);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
