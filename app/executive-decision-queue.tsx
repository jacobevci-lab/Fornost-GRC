"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { AssuranceRow } from "./control-assurance";
import { connectedTitle } from "./connected-grc-model";
import { dueTimestamp } from "./due-date";
import { consumePendingFornostFocus, navigateToFornost, peekPendingFornostFocus } from "./navigation-focus";
import NavIcon from "./nav-icon";
import type { AuditReadinessPortfolio } from "./audit-readiness-portfolio";
import { auditRequirementDeadline, auditPortfolioNames, auditPortfolioLinkLabel } from "./audit-overdue-requirements";

export type DecisionQueueHandle = { openOverdue: (trigger: HTMLButtonElement) => void };

export type DecisionEntry = {
  row: AssuranceRow;
  reason: "critical" | "overdue" | "high" | "compliance";
  score?: number;
};

const reasons = {
  critical: ["Kritik risk", "Critical risk"],
  overdue: ["Geciken denetim maddesi", "Overdue audit requirement"],
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
  if (entry.reason === "overdue") return dueTimestamp(auditRequirementDeadline(data));
  return dueTimestamp(data.dueDate || data.targetDate || data.endDate || data.nextReview || data.reviewDate);
}

export function orderDecisions(entries: DecisionEntry[]) {
  return entries.sort((a, b) => priority[a.reason] - priority[b.reason]
    || (b.score ?? 0) - (a.score ?? 0) || due(a) - due(b) || a.row.id.localeCompare(b.row.id));
}

export default function ExecutiveDecisionQueue({ entries, lang, completeAndClear, hidden, controls, portfolio }: {
  controls: Ref<DecisionQueueHandle>;
  portfolio?: AuditReadinessPortfolio;
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
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [revealed, setRevealed] = useState(origin?.revealed === "true");
  const portfolioNames = useMemo(() => auditPortfolioNames(portfolio), [portfolio]);
  const auditScope = module === "Denetim Yönetimi";
  useImperativeHandle(controls, () => ({
    openOverdue(button) {
      trigger.current = button;
      setRevealed(hidden);
      setModule("Denetim Yönetimi");
      setLimit(4);
      requestAnimationFrame(() => queue.current?.querySelector<HTMLElement>("h3")?.focus());
    },
  }), [hidden]);
  useEffect(() => {
    if (!origin?.recordId) return;
    consumePendingFornostFocus("Ana Sayfa");
    const target = queue.current?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(origin.recordId)}"]`);
    (target ?? queue.current?.querySelector<HTMLElement>("h3"))?.focus();
  }, [origin]);
  const filtered = module === "all" ? entries : entries.filter(entry => entry.row.module === module);
  const formatDate = new Intl.DateTimeFormat(tr ? "tr-TR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return <section ref={queue} id="executive-decisions" hidden={hidden && !revealed} className="executive-decision-board decision-queue" aria-labelledby="decision-queue-heading">
    <header className="decision-queue-head">
      <h3 id="decision-queue-heading" tabIndex={-1}>{auditScope ? (tr ? "Geciken denetim maddeleri" : "Overdue audit requirements") : (tr ? "Karar bekleyen kayıtlar" : "Records needing a decision")}</h3>
      <span>{filtered.length} {tr ? "kayıt" : "records"}</span>
    </header>
    {(entries.length > 0 || auditScope) && <div className="decision-filters" role="group" aria-label={tr ? "Kayıt türü" : "Record type"}>
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
          <button type="button" className="decision-record" data-record-id={row.id} aria-label={tr ? `${title} · ${ref} kaydını aç` : `Open ${title} · ${ref}`} aria-describedby={reason === "overdue" ? `decision-audit-${row.id} decision-owner-${row.id} decision-date-${row.id}` : undefined}
            onClick={() => navigateToFornost({ module: row.module, kind: "record", ref: row.id, source: "executive-dashboard", returnTo: { module: "Ana Sayfa", kind: "executive-decisions", filter: { scope: module, shown: String(limit), recordId: row.id, revealed: String(revealed) } } })}>
            <span className="decision-record-icon"><NavIcon module={row.module} /></span>
            <span className="decision-record-body">
              <span className="decision-record-context"><span className={`decision-reason ${reason}`}>{reasons[reason][tr ? 0 : 1]}</span><span className="decision-ref">{ref}</span></span>
              <strong>{title}</strong>
              {reason === "overdue" && <span className="decision-owner" id={`decision-audit-${row.id}`}>{auditPortfolioLinkLabel(row.data.auditName, portfolioNames, tr)}</span>}
              <span className="decision-owner" id={`decision-owner-${row.id}`}>{owner || (tr ? "Sorumlu atanmamış" : "Unassigned")}</span>
            </span>
            <span className="decision-date" id={`decision-date-${row.id}`}>{Number.isFinite(deadline) ? formatDate.format(deadline) : <span title={tr ? "Tarih atanmamış" : "No due date"}>—</span>}</span>
            <span aria-hidden="true" className="decision-arrow">→</span>
          </button>
        </li>;
      })}
    </ol> : <p>{auditScope ? (tr ? "Geciken denetim maddesi yok." : "No overdue audit requirements.") : completeAndClear && !entries.length
      ? (tr ? "Öncelikli karar bekleyen kayıt bulunmuyor." : "No priority decisions pending.")
      : (tr ? "Bu kapsamda inceleme bekleyen risk, denetim veya uyum kaydı bulunmuyor." : "No risk, audit or compliance records in this view need review.")}</p>}
    {(filtered.length > limit || limit > 4) && <footer className="decision-queue-foot">
      <span>{tr ? `${filtered.length} kaydın ${Math.min(limit, filtered.length)} tanesi` : `${Math.min(limit, filtered.length)} of ${filtered.length} records`}</span>
      {filtered.length > limit ? <button type="button" onClick={() => setLimit(value => value + 4)}>{tr ? "Daha fazla göster" : "Show more"}</button>
        : <button type="button" onClick={() => setLimit(4)}>{tr ? "Daha az göster" : "Show less"}</button>}
    </footer>}
    {hidden && revealed && <footer className="decision-queue-foot"><button type="button" onClick={() => {
      setRevealed(false);
      (trigger.current ?? Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-controls="executive-decisions"]')).find(button => button.getClientRects().length))?.focus();
    }}>{tr ? "Listeyi kapat" : "Close list"}</button></footer>}
  </section>;
}
