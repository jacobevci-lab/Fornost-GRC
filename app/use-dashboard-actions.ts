"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import { loadFindingGraph } from "./findings/graph-loader";
import { enterpriseWorkSources, projectEnterpriseWork, type EnterpriseWorkRow } from "./enterprise-work";
import type { AssuranceRow } from "./control-assurance";

type Batch = { scope: AssuranceRow[]; revision: number };
type Result<T> = { batch: Batch; rows: T[]; complete: boolean };

export function useDashboardActions(scope: AssuranceRow[]) {
  const [revision, setRevision] = useState(0);
  const batch = useMemo(() => ({ scope, revision }), [scope, revision]);
  const [findings, setFindings] = useState<Result<AssuranceRow>>();
  const [reviews, setReviews] = useState<Result<EnterpriseWorkRow>>();

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function read(path: string) {
      const response = await fetch(withBasePath(path), { cache: "no-store", signal });
      if (!response.ok) throw new Error("Source unavailable");
      return response.json();
    }
    loadFindingGraph(query => read("/api/findings?" + query)).then(data => {
      if (controller.signal.aborted) return;
      const rows = data.findings.filter(finding => typeof finding.status === "string" && finding.status.trim())
        .map(finding => ({ id: String(finding.id), module: "Bulgular ve CAPA", code: String(finding.code || ""), data: finding }));
      setFindings({ batch, complete: data.graphCoverage.complete && rows.length === data.findings.length, rows });
    }).catch(() => {
      if (!controller.signal.aborted) setFindings({ batch, complete: false, rows: [] });
    });
    Promise.allSettled(enterpriseWorkSources.map(async source => projectEnterpriseWork(source.key, await read(source.path))))
      .then(results => {
        if (controller.signal.aborted) return;
        const loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        setReviews({ batch, rows: loaded.flatMap(result => result.rows),
          complete: loaded.length === results.length && loaded.every(result => result.complete) });
      });
    const onFocus = () => { if (document.visibilityState === "visible") setRevision(n => n + 1); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [batch]);

  return {
    findings: findings?.batch === batch ? findings : undefined,
    reviews: reviews?.batch === batch ? reviews : undefined,
    retry: () => setRevision(n => n + 1),
  };
}
