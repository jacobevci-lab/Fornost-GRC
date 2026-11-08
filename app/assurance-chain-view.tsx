"use client";

import { useState } from "react";
import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow } from "./connected-grc-model";
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
    { module: risk, label: "Risk", options: risks, row: pick(risks, risk), empty: tr ? "Görünen risk bağlantısı yok" : "No visible risk link" },
    { module: control, label: tr ? "Kontrol" : "Control", options: controls, row: currentControl, empty: tr ? "Görünen kontrol bağlantısı yok" : "No visible control link" },
    { module: evidence, label: tr ? "Kanıt" : "Evidence", options: documents, row: pick(documents, evidence), empty: tr ? "Görünen kanıt bağlantısı yok" : "No visible evidence link" },
  ];
  return <div className="assurance-chain">
    <h4>{tr ? "Risk – Kontrol – Kanıt İlişkisi" : "Risk – Control – Evidence"}</h4>
    <ol>{steps.map(({module, label, options, row, empty}, i) => {
      const linked = i > 0 && row && steps[i - 1].row;
      const body = <><NavIcon module={module === control ? "Uyum" : module}/><span><small>{label}{row?.code && " · " + row.code}</small>
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
