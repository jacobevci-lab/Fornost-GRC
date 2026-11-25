"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import type { ExecutiveMetricKey, ExecutiveMetricTrend } from "./executive-metric-history";

type Period = 30 | 90 | 365;
type TrendPayload = {
  periodDays?: Period;
  snapshotDays?: number;
  historyStarted?: string | null;
  trends?: Partial<Record<ExecutiveMetricKey, ExecutiveMetricTrend>>;
};

type SnapshotMetric = { key: ExecutiveMetricKey; value: number };

const CARD_KEYS: ExecutiveMetricKey[] = [
  "grc_health",
  "high_critical_risks",
  "control_effectiveness",
  "compliance_readiness",
  "evidence_freshness",
  "overdue_actions",
];

function language() {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function periodLabel(period: Period, tr: boolean) {
  if (period === 365) return "12m";
  return tr ? `${period}g` : `${period}d`;
}

function selectedPeriod(): Period {
  const text = document.querySelector<HTMLButtonElement>(".ed4-period button.active")?.textContent?.trim().toLowerCase();
  if (text === "90d") return 90;
  if (text === "12m") return 365;
  return 30;
}

function parseMetricValue(text: string) {
  const match = text.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function currentSnapshot(): SnapshotMetric[] {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".ed9-health-strip .ed9-health-item"));
  return CARD_KEYS.flatMap((key, index) => {
    const value = parseMetricValue(cards[index]?.querySelector("strong")?.textContent || "");
    return value === null ? [] : [{ key, value }];
  });
}

function trendText(trend: ExecutiveMetricTrend | undefined, period: Period, tr: boolean) {
  const label = periodLabel(period, tr);
  if (!trend?.historyAvailable || trend.delta === null) return tr ? `${label} geçmişi oluşuyor` : `${label} history building`;
  if (trend.delta === 0) return tr ? `${label} değişim yok` : `No change vs ${label}`;
  const absolute = Math.abs(trend.delta);
  const arrow = trend.delta > 0 ? "↑" : "↓";
  const suffix = trend.metricKey === "high_critical_risks" || trend.metricKey === "overdue_actions" ? "" : tr ? " puan" : " pts";
  return tr ? `${arrow} ${absolute}${suffix} · ${label}` : `${arrow} ${absolute}${suffix} vs ${label}`;
}

function trendTone(trend: ExecutiveMetricTrend | undefined) {
  if (!trend?.historyAvailable || trend.improved === null) return "neutral";
  return trend.improved ? "improved" : "worse";
}

export default function DashboardMetricHistory() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  const [payload, setPayload] = useState<TrendPayload>({});
  const [lang, setLang] = useState<"tr" | "en">("tr");

  const loadHistory = useCallback(async (nextPeriod: Period) => {
    try {
      const response = await fetch(withBasePath(`/api/executive-metrics?period=${nextPeriod}`), { cache: "no-store" });
      if (!response.ok) return;
      setPayload((await response.json()) as TrendPayload);
    } catch {
      // Trend history is progressive enhancement; the dashboard remains usable without it.
    }
  }, []);

  useEffect(() => {
    let trendMount: HTMLDivElement | null = null;
    const discover = () => {
      setLang(language());
      const strip = document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v9 .ed9-health-strip");
      if (!strip) return;
      trendMount = strip.parentElement?.querySelector<HTMLDivElement>(":scope > .ed13-trend-mount") || null;
      if (!trendMount) {
        trendMount = document.createElement("div");
        trendMount.className = "ed13-trend-mount";
        strip.insertAdjacentElement("afterend", trendMount);
      }
      setMount((current) => (current === trendMount ? current : trendMount));
      setPeriod(selectedPeriod());
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = (event: MouseEvent) => {
      setLang(language());
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".ed4-period button");
      if (!button) return;
      const text = button.textContent?.trim().toLowerCase();
      const next: Period = text === "90d" ? 90 : text === "12m" ? 365 : 30;
      setPeriod(next);
    };
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      trendMount?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mount) return;
    const timer = window.setTimeout(() => void loadHistory(period), 0);
    return () => window.clearTimeout(timer);
  }, [mount, period, loadHistory]);

  useEffect(() => {
    if (!mount) return;
    const timer = window.setTimeout(async () => {
      const metrics = currentSnapshot();
      if (metrics.length !== CARD_KEYS.length) return;
      const day = new Date().toISOString().slice(0, 10);
      const sessionKey = `fornost:executive-metric-snapshot:${day}`;
      if (window.sessionStorage.getItem(sessionKey) === "captured") return;
      try {
        const response = await fetch(withBasePath("/api/executive-metrics"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ period, metrics }),
        });
        if (response.ok) {
          window.sessionStorage.setItem(sessionKey, "captured");
          setPayload((await response.json()) as TrendPayload);
          return;
        }
        if (response.status === 401 || response.status === 403) void loadHistory(period);
      } catch {
        // Snapshot capture must never block or degrade the executive dashboard.
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [mount, period, loadHistory]);

  if (!mount) return null;
  const tr = lang === "tr";
  return createPortal(
    <section className="ed13-trend-strip" aria-label={tr ? "Yönetici metrik trendleri" : "Executive metric trends"}>
      {CARD_KEYS.map((key) => {
        const trend = payload.trends?.[key];
        return (
          <div key={key} className={`ed13-trend ${trendTone(trend)}`} title={trend?.baselineDay ? `${trend.baselineDay} → ${trend.currentDay || ""}` : undefined}>
            <i aria-hidden="true" />
            <span>{trendText(trend, period, tr)}</span>
          </div>
        );
      })}
    </section>,
    mount,
  );
}
