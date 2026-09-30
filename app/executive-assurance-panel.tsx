"use client";

import { useEffect, useMemo, useState } from "react";
import { buildExecutiveAssurance } from "./executive-assurance";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import ContinuousAssuranceAttention from "./continuous-assurance-attention";
import ExecutiveDashboardReference from "./executive-dashboard-reference";
import "./executive-assurance.css";
import "./assurance-delivery-posture.css";

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
  const assurance = useMemo(() => buildExecutiveAssurance(rows), [rows]);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [delivery, setDelivery] = useState<DeliveryOps | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(withBasePath("/api/continuous-assurance/executive"), {
        cache: "no-store",
        headers: { accept: "application/json" },
      }).then((response) => response.ok ? response.json() : null),
      fetch(withBasePath("/api/continuous-assurance/notifications"), {
        cache: "no-store",
        headers: { accept: "application/json" },
      }).then((response) => response.ok ? response.json() : null),
    ]).then(([executive, notification]: [Operations | null, DeliveryOps | null]) => {
      if (!live) return;
      if (executive) setOperations(executive);
      if (notification) setDelivery(notification);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

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
    <ExecutiveDashboardReference rows={rows} lang={lang} go={go} />

    <details className="executive-operational-detail">
      <summary>
        <span>
          <small>{tr ? "OPERASYONEL GÜVENCE DETAYI" : "OPERATIONAL ASSURANCE DETAIL"}</small>
          <b>{tr ? "Owner accountability, delivery SLA ve teknik attention kuyruğu" : "Owner accountability, delivery SLA and technical attention queue"}</b>
        </span>
        <span className={operationalSignals ? "attention" : "healthy"}>
          {operationalSignals} {tr ? "aktif sinyal" : "active signals"}
        </span>
      </summary>

      <div className="executive-operational-detail-body">
        <section className="executive-owner-accountability">
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
        </section>

        <section className="executive-delivery-posture">
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
        </section>

        <div className="executive-authoritative-attention">
          <ContinuousAssuranceAttention lang={lang}/>
        </div>
      </div>
    </details>
  </>;
}
