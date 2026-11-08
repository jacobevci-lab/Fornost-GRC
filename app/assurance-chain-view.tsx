"use client";

import { useMemo, useState } from "react";
import { buildConnectedGrcGraph, connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow } from "./connected-grc-model";
import { evaluateEvidenceEligibility } from "./evidence/eligibility";
import { navigateToFornost } from "./navigation-focus";
import NavIcon from "./nav-icon";
import { displayRecordCode } from "./record-codes";
import "./assurance-chain-view.css";

type Row = ConnectedGrcRow;
type Lang = "tr" | "en";
const risk = "Risk Assessment", control = "Kontroller", evidence = "Kanıtlar";
export const hasAssuranceChain = (row: Row) => [risk, control, evidence].includes(row.module);

function neighbours(row: Row | undefined, links: ConnectedGrcLink[], relation: string, module: string) {
  const records = new Map<string, Row>();
  if (row) for (const link of links) {
    if (link.relation !== relation) continue;
    const other = link.source.id === row.id ? link.target : link.target.id === row.id ? link.source : undefined;
    if (other?.module === module) records.set(other.id, other);
  }
  return [...records.values()].sort((a, b) => displayRecordCode(a).localeCompare(displayRecordCode(b)));
}

export function AssuranceChain({ anchor, links, lang, openRecord, inspector = false, trail = [] }: {
  anchor: Row; links: ConnectedGrcLink[]; lang: Lang; openRecord: (row: Row) => void; inspector?: boolean; trail?: string[];
}) {
  const tr = lang === "tr";
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const pick = (options: Row[], key: string) => options.find(row => row.id === chosen[key]) ||
    options.find(row => trail.includes(row.id)) || options[0];
  const controls = anchor.module === control ? [anchor] :
    neighbours(anchor, links, anchor.module === risk ? "risk-control" : "control-evidence", control);
  const currentControl = pick(controls, control);
  const risks = anchor.module === risk ? [anchor] : neighbours(currentControl, links, "risk-control", risk);
  const documents = anchor.module === evidence ? [anchor] : neighbours(currentControl, links, "control-evidence", evidence);
  const steps = [
    { module: risk, label: tr ? "Risk" : "Risk", options: risks, row: pick(risks, risk), empty: tr ? "Görünen risk bağlantısı yok" : "No visible risk link" },
    { module: control, label: tr ? "Kontrol" : "Control", options: controls, row: currentControl, empty: tr ? "Görünen kontrol bağlantısı yok" : "No visible control link" },
    { module: evidence, label: tr ? "Kanıt" : "Evidence", options: documents, row: pick(documents, evidence), empty: tr ? "Görünen kanıt bağlantısı yok" : "No visible evidence link" },
  ];
  return <div className="assurance-chain">
    <h4>{tr ? "Risk – Kontrol – Kanıt İlişkisi" : "Risk – Control – Evidence"}</h4>
    <ol>{steps.map(({module, label, options, row, empty}, i) => {
      const linked = i > 0 && row && steps[i - 1].row;
      const body = <><NavIcon module={module}/><span><small>{label}{row?.code && " · " + row.code}</small>
        <strong>{row ? connectedTitle(row) : empty}</strong></span></>;
      return <li key={module} data-stage={i} data-connected={linked ? "yes" : "no"} data-present={!!row}>
        {row && !(inspector && row.id === anchor.id)
          ? <button type="button" className="chain-node" onClick={() => openRecord(row)}>{body}<i aria-hidden="true">›</i></button>
          : <div className="chain-node">{body}</div>}
        {options.length > 1 && <select aria-label={tr ? label + " seç" : "Select " + label.toLowerCase()}
          value={row?.id} onChange={event => setChosen({...chosen,[module]:event.target.value})}>
          {options.map(item => <option key={item.id} value={item.id}>{displayRecordCode(item)} · {connectedTitle(item)}</option>)}
        </select>}
      </li>;
    })}</ol>
  </div>;
}

export function DashboardChain({ rows, highRisks, evidenceRows, evidenceReady, now, lang }: {
  rows: Row[]; highRisks: Row[]; evidenceRows: Row[]; evidenceReady: boolean; now: number; lang: Lang;
}) {
  const tr = lang === "tr";
  const [mode, setMode] = useState<"risk" | "evidence">("risk");
  const [choice, setChoice] = useState("");
  const graph = useMemo(() => buildConnectedGrcGraph(rows), [rows]);
  const overdue = useMemo(() => evidenceRows.filter(row => row.module === evidence &&
    evaluateEvidenceEligibility(row.data, new Date(now)).reasons.includes("expired")), [evidenceRows, now]);
  const options = mode === "risk" ? highRisks : evidenceReady ? overdue : [];
  const anchor = options.find(row => row.id === choice) || options[0];
  const open = (row: Row) => navigateToFornost({ module: row.module, ref: row.id, kind: "record", source: "dashboard-chain", returnTo: { module: "Ana Sayfa" } });
  return <section className="chain-board" aria-label={tr ? "Bağlantılı kayıt özeti" : "Connected record overview"}>
    <div className="chain-summary">
      <h3>{tr ? "Özet" : "Overview"}</h3>
      <div className="chain-switches">{([
        ["risk", risk, highRisks.length, tr ? "Yüksek veya kritik risk" : "High or critical risks"],
        ["evidence", evidence, evidenceReady ? overdue.length : "—", tr ? "Yenilenecek kanıt" : "Evidence to renew"],
      ] as const).map(([id,module,count,label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => {setMode(id); setChoice("");}}>
        <NavIcon module={module}/><b>{count}</b><span>{label}</span><i aria-hidden="true">›</i>
      </button>)}</div>
      {options.length > 1 && <select aria-label={tr ? "İncelenecek kayıt" : "Record to inspect"} value={anchor?.id}
        onChange={event => setChoice(event.target.value)}>{options.map(row => <option key={row.id} value={row.id}>{connectedTitle(row)} · {displayRecordCode(row)}</option>)}</select>}
    </div>
    {anchor ? <AssuranceChain key={anchor.id} anchor={anchor} lang={lang} links={graph.links} openRecord={open}/> :
      <div className="chain-empty" role="status">{mode === "risk" ? (tr ? "Yüksek veya kritik risk bulunmuyor." : "No high or critical risks.")
        : !evidenceReady ? (tr ? "Kanıt güncelliği doğrulanamadı." : "Evidence freshness is unconfirmed.")
        : (tr ? "Yenileme bekleyen kanıt yok." : "No evidence is due for renewal.")}</div>}
  </section>;
}
