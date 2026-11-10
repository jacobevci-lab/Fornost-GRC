import {Fragment, useState} from "react";
import type {Finding} from "./workspace";
import {findingLabel} from "./presentation";

type Lang = "tr" | "en";

function deadline(finding: Finding, lang: Lang, today: string) {
  const tr = lang === "tr";
  const accepted = finding.status === "accepted";
  const day = accepted ? finding.acceptUntil : finding.dueDate;
  if (!day) return {date: "—", note: "", late: false};
  const stamp = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(stamp)) return {date: "—", note: "", late: false};
  const date = new Intl.DateTimeFormat(tr ? "tr-TR" : "en-GB", {dateStyle: "medium", timeZone: "UTC"}).format(stamp);
  const elapsed = (Date.parse(today + "T00:00:00Z") - stamp) / 86_400_000;
  if (finding.status === "closed") return {date, note: "", late: false};
  if (elapsed > 0) return {date, late: true, note: accepted ? findingLabel("acceptance-expired", lang) : tr ? `${elapsed} gün gecikti` : `${elapsed} ${elapsed === 1 ? "day" : "days"} overdue`};
  if (elapsed === 0) return {date, late: false, note: accepted ? (tr ? "Kabul bugün bitiyor" : "Acceptance ends today") : (tr ? "Bugün" : "Due today")};
  return {date, late: false, note: accepted ? (tr ? "Kabul bitişi" : "Acceptance ends") : ""};
}

function nextStep(finding: Finding, tr: boolean) {
  switch (finding.status) {
    case "verification": return tr ? "Gönderilen kanıt bağımsız doğrulayıcının incelemesini bekliyor." : "Submitted evidence awaits independent review.";
    case "closed": return tr ? "Bulgu kapalı. Kapanış kararını ve kanıtını inceleyebilirsiniz." : "This finding is closed. View the closure decision and evidence.";
    case "accepted": return finding.attention === "acceptance-expired"
      ? (tr ? "Risk kabul süresi doldu. Kabul kararını yeniden değerlendirin." : "Risk acceptance expired. Reassess the decision.")
      : (tr ? "Risk kabul gerekçesini ve geçerlilik süresini inceleyin." : "Review the risk acceptance rationale and expiry.");
    default: return finding.correctiveAction.trim() || (tr ? "Aksiyon planını inceleyin." : "Review the action plan.");
  }
}

export function FindingWorklist({rows, lang, disabled, onOpen}: {
  rows: Finding[]; lang: Lang; disabled: boolean; onOpen: (finding: Finding) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const tr = lang === "tr";
  const today = new Date().toISOString().slice(0, 10);
  const columns = tr ? ["Bulgu", "Kaynak", "Önem", "Sorumlu", "Termin", "Durum"] : ["Finding", "Source", "Severity", "Owner", "Due", "Status"];
  return <table className="finding-table capa-list">
    <thead><tr>{columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(row => {
      const open = expanded === row.id;
      const panelId = "capa-next-" + encodeURIComponent(row.id);
      const due = deadline(row, lang, today);
      return <Fragment key={row.id}>
        <tr className="capa-record" onClick={() => {if (!disabled) onOpen(row);}}>
          <td><div className="capa-identity">
            <button type="button" className="capa-toggle" disabled={disabled} aria-expanded={open} aria-controls={open ? panelId : undefined}
              aria-label={(tr ? "Sıradaki işlem · " : "Next step · ") + row.code}
              onClick={event => {event.stopPropagation(); setExpanded(open ? null : row.id);}}>
              <span className="capa-marker" aria-hidden="true"/>
            </button>
            <div><small className="capa-code">{row.code}</small>
              <button type="button" disabled={disabled} className="finding-row-open"
                onClick={event => {event.stopPropagation(); onOpen(row);}}>{row.title}</button></div>
          </div></td>
          <td data-label={columns[1]}>{findingLabel(row.sourceType, lang)}</td>
          <td data-label={columns[2]}><span className={`finding-badge ${row.severity}`}>{findingLabel(row.severity, lang)}</span></td>
          <td data-label={columns[3]}>{row.owner || "—"}</td>
          <td data-label={columns[4]}>{due.date}{due.note && <small className={due.late ? "danger" : ""}>{due.note}</small>}</td>
          <td data-label={columns[5]}><span className={`finding-state ${row.status}`}>{findingLabel(row.status, lang)}</span></td>
        </tr>
        {open && <tr className="capa-next-row"><td colSpan={6}>
          <div className="capa-next" id={panelId}><div><strong>{tr ? "Sıradaki işlem" : "Next step"}</strong><p>{nextStep(row, tr)}</p></div>
            <button type="button" disabled={disabled} onClick={() => onOpen(row)}>{tr ? "Aksiyon planını aç" : "Open action plan"}</button>
          </div>
        </td></tr>}
      </Fragment>;
    })}</tbody>
  </table>;
}
