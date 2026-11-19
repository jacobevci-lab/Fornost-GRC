"use client";
import {useState} from "react";
import {auditClosureBlockerLabels, closureFindingGaps, type AuditClosurePreview} from "./audit-closure";
import {outstandingAuditItem, type AuditReportItem} from "./audit-status-report";
import {recordLinkFragment, recordLinkTarget} from "./record-links";

const recordKinds: Partial<Record<string, AuditReportItem["kind"]>> = {
  requirements: "requirement", requests: "request", milestones: "milestone",
  workpapers: "workpaper", findings: "finding",
};

function BlockedRecords({items, auditId, tr}: {items: AuditReportItem[]; auditId: string; tr: boolean}) {
  const [limit, setLimit] = useState(10);
  return <><ul>{items.slice(0, limit).map(item => {
    const {data, code} = item.record;
    const title = String(data.requirementTitle || data.title || code || item.id);
    const target = item.kind === "finding" ? null : recordLinkTarget({
      module: "Denetim Yönetimi", ref: item.id,
      ...(item.kind === "requirement" ? {kind: "record"} : {kind: "audit-" + item.kind, auditId}),
    });
    const gaps = closureFindingGaps(item).map(gap => gap === "owner"
      ? (tr ? "Sorumlu eksik" : "Missing owner") : (tr ? "Geçerli termin gerekli" : "Valid due date required"));
    return <li key={item.id}>{target
      ? <a href={recordLinkFragment(target)} target="_blank" rel="noopener noreferrer"
          aria-label={title + (tr ? " (yeni sekmede aç)" : " (open in new tab)")}>{title} ↗</a>
      : <strong>{title}</strong>}
      <small>{[data.requirementRef || code, data.owner, data.dueDate, ...gaps].filter(Boolean).join(" · ")}</small>
    </li>;
  })}</ul>{items.length > limit && <button type="button" onClick={() => setLimit(limit + 10)}>
    {tr ? "Daha fazla kayıt göster" : "Show more records"} ({limit}/{items.length})
  </button>}</>;
}

export function AuditClosureBlockers({preview, tr}: {preview: AuditClosurePreview; tr: boolean}) {
  if (!preview.blockers.length) return null;
  const {source} = preview;
  return <section className="acl-blockers" aria-label={tr ? "Kapanışı engelleyenler" : "Closure blockers"}>
    <h5>{tr ? "Kapanışı engelleyenler" : "Closure blockers"}</h5>
    {preview.blockers.map(blocker => {
      const items = source.items.filter(item => item.kind === recordKinds[blocker] &&
        (item.kind === "finding" ? closureFindingGaps(item).length > 0 : outstandingAuditItem(item)));
      const label = auditClosureBlockerLabels[blocker]?.[tr ? 0 : 1] || blocker;
      const workflowOpen = blocker === "requests" && source.workflow.state !== "closed";
      return <div key={blocker}>{items.length
        ? <details><summary>{label} ({items.length})</summary>
            <BlockedRecords items={items} auditId={source.audit.id} tr={tr}/></details> : <p>{label}</p>}
        {workflowOpen && <small>{tr ? "Kanıt talepleri çalışma planı henüz kapatılmadı." : "The evidence request work plan is still open."}</small>}
      </div>;
    })}
  </section>;
}
