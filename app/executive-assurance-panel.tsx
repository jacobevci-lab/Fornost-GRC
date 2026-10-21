"use client";

import { useEffect, useMemo, useState } from "react";
import { useExecutiveAssurance } from './use-executive-assurance';
import { buildExecutiveAssurance } from "./executive-assurance";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import ContinuousAssuranceAttention from "./continuous-assurance-attention";
import ExecutiveDashboardReference from "./executive-dashboard-reference";
import "./executive-assurance.css";
import "./assurance-delivery-posture.css";
import "./executive-operational-detail.css";

type Operations = {
  summary: {
    openEscalations: number;
    critical: number;
    high: number;
    unacknowledged: number;
    ownerless: number;
    ownerCoverage: number;
    overdueRiskReviews: number;
    mandatoryRetests: number;
    retestFailures: number;
    oldestOpenAgeDays: number;
    queuedNotifications: number;
  };
  routes: { owner: number; governance: number };
  owners: Array<{
    owner: string;
    assigned: boolean;
    open: number;
    critical: number;
    high: number;
    unacknowledged: number;
    oldestAgeDays: number;
    kinds: string[];
  }>;
};

type DeliveryOps = {
  policy?: {
    criticalSlaMinutes?: number;
    highSlaMinutes?: number;
    mediumSlaMinutes?: number;
    maxAttempts?: number;
  };
  summary: {
    pending: number;
    sent: number;
    sent30d: number;
    failed: number;
    retryExhausted: number;
    attempts30d: number;
    deliveryRate30d: number;
    inAppOnly: number;
    slaBreaches: number;
  };
};

export default function ExecutiveAssurancePanel({
  rows,
  lang,
  go,
}: {
  rows: AssuranceRow[];
  lang: "tr" | "en";
  go: (module: string) => void;
}) {
  const tr = lang === "tr";
  const evidenceState = useExecutiveAssurance(rows);
  const assurance = useMemo(() => buildExecutiveAssurance(evidenceState.rows, evidenceState.generatedAt, evidenceState.auditPortfolio), [evidenceState.rows, evidenceState.generatedAt, evidenceState.auditPortfolio]);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [delivery, setDelivery] = useState<DeliveryOps | null>(null);

  const [expanded, setExpanded] = useState(false), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    const read = async (path: string) => {
      const response = await fetch(withBasePath(path), { cache: "no-store", headers: { accept: "application/json" }, signal });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!data || typeof data.summary !== 'object' || data.summary === null || Array.isArray(data.summary)) throw new Error('invalid');
      return data;
    };
    Promise.allSettled([read('/api/continuous-assurance/executive'), read('/api/continuous-assurance/notifications')]).then(([executive, notification]) => {
      if (!live) return;
      setOperations(executive.status === 'fulfilled' ? executive.value : null);
      setDelivery(notification.status === 'fulfilled' ? notification.value : null);
      setLoadError(executive.status === 'rejected' || notification.status === 'rejected');
      setLoading(false);
    });
    return () => { live = false; controller.abort(); };
  }, [expanded, reload]);

  const deliverySummary = delivery?.summary;
  const ownerRows = operations?.owners?.slice(0, 5) || [];
  const operationalSignals =
    (operations?.summary.openEscalations || 0) +
    (operations?.summary.ownerless || 0) +
    (deliverySummary?.slaBreaches || 0) +
    assurance.openControlFindings;
  const auditorPack = () => window.open(
    withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`),
    "_blank",
    "noopener,noreferrer",
  );

  return <>
    <ExecutiveDashboardReference rows={rows} evidenceState={evidenceState} lang={lang} go={go} />

    <details className="executive-operational-detail" onToggle={e => {
      const open = e.currentTarget.open;
      setExpanded(open);
      setLoading(open);
      if (open) { setLoadError(false); setOperations(null); setDelivery(null); }
    }}>
      <summary>
        <span>
          <small>{tr ? "OPERASYONEL GÜVENCE DETAYI" : "OPERATIONAL ASSURANCE DETAIL"}</small>
          <b>{tr ? "Sorumlu atamaları, bildirim SLA ve operasyonel işler" : "Owner accountability, delivery SLA and technical attention queue"}</b>
        </span>
        <span className={!loading && operations && delivery ? (operationalSignals ? "attention" : "healthy") : ""}>
          {rows.length && evidenceState.ready && assurance.score !== null ? `${assurance.score}/100` : (tr ? "Değerlendirme bekleniyor" : "Awaiting evaluation")} · {!loading && operations && delivery ? `${operationalSignals} ${tr ? "aktif sinyal" : "active signals"}` : (loading ? (tr ? "Operasyonel veriler yükleniyor…" : "Loading operational data…") : loadError ? (tr ? "Operasyonel veriler eksik" : "Operational data incomplete") : (tr ? "Operasyonel ayrıntıları açın" : "Open operational details"))}
        </span>
      </summary>

      {expanded && <div className="executive-operational-detail-body" aria-busy={loading}>
        {loading && <p role="status">{tr ? 'Operasyonel veriler yükleniyor…' : 'Loading operational data…'}</p>}
        {loadError && <div role="status"><p>{tr ? 'Bazı operasyonel veriler yüklenemedi. Eksik kaynaklar sıfır olarak gösterilmez.' : 'Some operational data could not be loaded. Missing sources are not shown as zero.'}</p><button type="button" onClick={() => { setLoading(true); setLoadError(false); setOperations(null); setDelivery(null); setReload(value => value + 1); }}>{tr ? 'Yeniden dene' : 'Retry'}</button></div>}
        {!loading && operations && <section className="executive-owner-accountability">
          <header>
            <div>
              <small>OWNER ACCOUNTABILITY</small>
              <b>{tr ? "Açık güvence aksiyonlarının sahiplik görünümü" : "Ownership view for open assurance actions"}</b>
            </div>
            <span>{operations?.summary.ownerCoverage ?? 0}% {tr ? "kapsama" : "coverage"}</span>
          </header>
          <div>
            {ownerRows.length ? ownerRows.map((owner) => (
              <article key={owner.owner} className={!owner.assigned || owner.critical ? "attention" : ""}>
                <div>
                  <b>{owner.assigned ? owner.owner : (tr ? "Atanmamış" : "Unassigned")}</b>
                  <small>{owner.kinds.join(" · ") || (tr ? "Güvence aksiyonu" : "Assurance action")}</small>
                </div>
                <strong>{owner.open}</strong>
                <span>{owner.critical} C · {owner.high} H · {owner.unacknowledged} Ack</span>
                <em>{owner.oldestAgeDays}d</em>
              </article>
            )) : (
              <p>{tr ? "Açık owner aksiyonu bulunmuyor." : "No open owner actions."}</p>
            )}
          </div>
        </section>}

        {!loading && delivery && <section className="executive-delivery-posture">
          <header>
            <div>
              <small>DELIVERY &amp; SLA</small>
              <b>{tr ? "Gerçek transport ve notification SLA görünümü" : "Real transport and notification SLA posture"}</b>
            </div>
            <button type="button" onClick={auditorPack}>{tr ? "Denetçi Paketi" : "Auditor Pack"} ↗</button>
          </header>
          <div>
            <article className={deliverySummary?.pending ? "attention" : ""}>
              <small>{tr ? "Gönderim bekleyen" : "Pending delivery"}</small>
              <b>{deliverySummary?.pending || 0}</b>
            </article>
            <article>
              <small>{tr ? "30g transport sent" : "30d transport sent"}</small>
              <b>{deliverySummary?.sent30d ?? deliverySummary?.sent ?? 0}</b>
              <span>{deliverySummary?.deliveryRate30d ?? 0}%</span>
            </article>
            <article className={deliverySummary?.failed ? "critical" : ""}>
              <small>{tr ? "Hatalı açık kuyruk" : "Failed open queue"}</small>
              <b>{deliverySummary?.failed || 0}</b>
              <span>{deliverySummary?.retryExhausted || 0} exhausted</span>
            </article>
            <article>
              <small>{tr ? "Yalnız in-app" : "In-app only"}</small>
              <b>{deliverySummary?.inAppOnly || 0}</b>
            </article>
            <article className={deliverySummary?.slaBreaches ? "critical" : ""}>
              <small>{tr ? "SLA ihlali" : "SLA breaches"}</small>
              <b>{deliverySummary?.slaBreaches || 0}</b>
              <span>{deliverySummary?.attempts30d || 0} / 30d</span>
            </article>
          </div>
        </section>}

        <div className="executive-authoritative-attention">
          <ContinuousAssuranceAttention lang={lang}/>
        </div>
      </div>}
    </details>
  </>;
}
