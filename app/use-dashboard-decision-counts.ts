"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import type { AssuranceRow } from "./control-assurance";

type Count = number | "loading" | "unavailable";
type Counts = { escalations: Count; findings: Count };
const pending: Counts = { escalations: "loading", findings: "loading" };
const endpoints = {
  escalations: "/api/continuous-assurance/executive?view=dashboard-count",
  findings: "/api/findings?view=dashboard-count",
};

export function useDashboardDecisionCounts(rows: AssuranceRow[]) {
  const [result, setResult] = useState<{ scope: AssuranceRow[]; counts: Counts; asOf: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight: AbortController | null = null;
    async function refresh() {
      if (inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      setResult({ scope: rows, counts: pending, asOf: Date.now() });

      async function read(source: keyof Counts) {
        let count: Count = "unavailable";
        try {
          const response = await fetch(withBasePath(endpoints[source]), {
            cache: "no-store", headers: { accept: "application/json" }, signal,
          });
          if (response.ok) {
            const payload = await response.json();
            if (Number.isSafeInteger(payload?.count) && payload.count >= 0) count = payload.count;
          }
        } catch { /* A failed read leaves this source unavailable. */ }
        if (active) setResult(current => current && current.scope === rows
          ? { ...current, counts: { ...current.counts, [source]: count } } : current);
      }

      await Promise.all([read("escalations"), read("findings")]);
      inFlight = null;
    }
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60000);
    return () => {
      active = false;
      inFlight?.abort();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [rows, attempt]);

  return {
    counts: result?.scope === rows ? result.counts : pending,
    asOf: result?.asOf ?? null,
    retry: () => { setResult(null); setAttempt(value => value + 1); },
  };
}
