"use client";

import { useEffect, useRef, useState } from "react";
import type { AssuranceRow } from "./control-assurance";
import { connectedTitle } from "./connected-grc-model";
import { dueTimestamp } from "./due-date";
import { consumePendingFornostFocus, navigateToFornost, peekPendingFornostFocus } from "./navigation-focus";
import NavIcon from "./nav-icon";

export type DecisionEntry = {
  row: AssuranceRow;
  reason: "critical" | "overdue" | "high" | "compliance";
  score?: number;
};

const reasons = {
  critical: ["Kritik risk", "Critical risk"],
  overdue: ["Geciken denetim", "Overdue audit"],
  high: ["Yüksek risk", "High risk"],
  compliance: ["Uyum açığı", "Compliance gap"],
};
const priority = { critical: 0, overdue: 1, high: 2, compliance: 3 };
const scopes = [
  { module: "all", tr: "Tümü", en: "All" },
  { module: "Risk Assessment", tr: "Risk", en: "Risk" },
  { module: "Denetim Yönetimi", tr: "Denetim", en: "Audit" },
  { module: "Uyum", tr: "Uyum", en: "Compliance" },
];

function due(entry: DecisionEntry) {
  const data = entry.row.data;
  return dueTimestamp(data.dueDate || data.targetDate || data.endDate || data.nextReview || data.reviewDate);
}

export function orderDecisions(entries: DecisionEntry[]) {
  return entries.sort((a, b) => priority[a.reason] - priority[b.reason]
    || (b.score ?? 0) - (a.score ?? 0) || due(a) - due(b) || a.row.id.localeCompare(b.row.id));
}

export default function ExecutiveDecisionQueue({ entries, lang, completeAndClear, hidden }: {
  entries: DecisionEntry[];
  lang: "tr" | "en";
  completeAndClear: boolean;
  hidden: boolean;
}) {
  const tr = lang === "tr";
  const [origin] = useState(() => {
    const request = peekPendingFornostFocus();
    return request?.module === "Ana Sayfa" && request.kind === "executive-decisions" ? request.filter : undefined;
  });
  const [module, setModule] = useState(() => scopes.find(scope => scope.module === origin?.scope)?.module ?? "all");
  const [limit, setLimit] = useState(() => {
    const shown = Number(origin?.shown);
    return Number.isSafeInteger(shown) && shown >= 4 ? shown : 4;
  });
  const queue = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!origin?.recordId) return;
    consumePendingFornostFocus("Ana Sayfa");
    const target = queue.current?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(origin.recordId)}"]`);
    (target ?? queue.current?.querySelector<HTMLElement>("h3"))?.focus();
  }, [origin]);
  const filtered = module === "all" ? entries : entries.filter(entry => entry.row.module === module);
  const formatDate = new Intl.DateTimeFormat(tr ? "tr-TR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return <section ref={queue} id="executive-decisions" hidden={hidden} className="executive-decision-board decision-queue" aria-labelledby="decision-queue-heading">
    <header className="decision-queue-head">
      <h3 id="decision-queue-heading" tabIndex={-1}>{tr ? "Karar bekleyen kayıtlar" : "Records needing a decision"}</h3>
      <span>{filtered.length} {tr ? "kayıt" : "records"}</span>
    </header>
    {entries.length > 0 && <div className="decision-filters" role="group" aria-label={tr ? "Kayıt türü" : "Record type"}>
      {scopes.map(scope => <button type="button" key={scope.module} aria-pressed={module === scope.module}
        onClick={() => { setModule(scope.module); setLimit(4); }}>{scope[lang]}</button>)}
    </div>}
    {filtered.length > 0 ? <ol className="decision-records">
      {filtered.slice(0, limit).map(entry => {
        const { row, reason } = entry;
        const title = connectedTitle(row);
        const ref = row.code || row.id;
        const deadline = due(entry);
        const owner = String(row.data.owner || row.data.responsible || row.data.auditOwner || "").trim();
        return <li key={row.id}>
          <button type="button" className="decision-record" data-record-id={row.id} aria-label={tr ? `${title} · ${ref} kaydını aç` : `Open ${title} · ${ref}`}
            onClick={() => navigateToFornost({ module: row.module, kind: "record", ref: row.id, source: "executive-dashboard", returnTo: { module: "Ana Sayfa", kind: "executive-decisions", filter: { scope: module, shown: String(limit), recordId: row.id } } })}>
            <span className="decision-record-icon"><NavIcon module={row.module} /></span>
            <span className="decision-record-body">
              <span className="decision-record-context"><span className={`decision-reason ${reason}`}>{reasons[reason][tr ? 0 : 1]}</span><span className="decision-ref">{ref}</span></span>
              <strong>{title}</strong>
              <span className="decision-owner">{owner || (tr ? "Sorumlu atanmamış" : "Unassigned")}</span>
            </span>
            <span className="decision-date">{Number.isFinite(deadline) ? formatDate.format(deadline) : (tr ? "Tarih atanmamış" : "No due date")}</span>
            <span aria-hidden="true" className="decision-arrow">→</span>
          </button>
        </li>;
      })}
    </ol> : <p>{completeAndClear && !entries.length
      ? (tr ? "Öncelikli karar bekleyen kayıt bulunmuyor." : "No priority decisions pending.")
      : (tr ? "Bu kapsamda inceleme bekleyen risk, denetim veya uyum kaydı bulunmuyor." : "No risk, audit or compliance records in this view need review.")}</p>}
    {(filtered.length > limit || limit > 4) && <footer className="decision-queue-foot">
      <span>{tr ? `${filtered.length} kaydın ${Math.min(limit, filtered.length)} tanesi` : `${Math.min(limit, filtered.length)} of ${filtered.length} records`}</span>
      {filtered.length > limit ? <button type="button" onClick={() => setLimit(value => value + 4)}>{tr ? "Daha fazla göster" : "Show more"}</button>
        : <button type="button" onClick={() => setLimit(4)}>{tr ? "Daha az göster" : "Show less"}</button>}
    </footer>}
  </section>;
}
