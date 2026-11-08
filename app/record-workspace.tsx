"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildConnectedGrcGraph, connectedTitle, type ConnectedGrcRow } from "./connected-grc-model";
import NavIcon from "./nav-icon";
import { AssuranceChain, hasAssuranceChain } from "./assurance-chain-view";
import { assessedRiskScore } from "./risk-methodology";
import { displayRecordCode } from "./record-codes";

type Inspect = (row: ConnectedGrcRow, button: HTMLButtonElement) => void;
type Props = {
  rows: ConnectedGrcRow[];
  visible: ConnectedGrcRow[];
  lang: "tr" | "en";
  moduleNames: Record<string, string>;
  formatValue: (value: string, lang: "tr" | "en") => string;
  preview: (id: string) => void;
  children: (inspect: Inspect, open: boolean) => ReactNode;
};

export default function RecordWorkspace({ rows, visible, lang, moduleNames, formatValue, preview, children }: Props) {
  const tr = lang === "tr";
  const [path, setPath] = useState<string[]>([]);
  const [origin, setOrigin] = useState<{ rowId: string; button: HTMLButtonElement; x: number; y: number; tableLeft: number } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const root = visible.find(row => row.id === path[0]);
  const selectedId = path.at(-1);
  const selected = root && rows.find(row => row.id === selectedId);
  const open = !!selected;
  const graph = useMemo(() => open ? buildConnectedGrcGraph(rows) : null, [open, rows]);

  if (path.length && !selected) setPath([]);
  useLayoutEffect(() => {
    if (!open) return;
    title.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 740px)").matches) {
      title.current?.closest(".record-workspace")?.scrollIntoView({ block: "start" });
    } else {
      title.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open, selectedId]);

  function inspect(row: ConnectedGrcRow, button: HTMLButtonElement) {
    setOrigin({ button, rowId: row.id, x: window.scrollX, y: window.scrollY, tableLeft: button.closest(".table-wrap")?.scrollLeft || 0 });
    setPath([row.id]);
  }
  function close() {
    setPath([]);
    const previous = origin;
    requestAnimationFrame(() => {
      if (!previous?.button.isConnected) return;
      const destination = root && root.id !== previous.rowId
        ? previous.button.closest("table")?.querySelector<HTMLButtonElement>(`button.record-open[data-record-id="${CSS.escape(root.id)}"]`)
        : previous.button;
      destination?.focus({ preventScroll: true });
      const table = previous.button.closest(".table-wrap");
      if (table) table.scrollLeft = previous.tableLeft;
      if (!destination || destination === previous.button) window.scrollTo(previous.x, previous.y);
      else destination.scrollIntoView({ block: "nearest" });
    });
  }
  function follow(id: string) {
    setPath(current => {
      const index = current.indexOf(id);
      return index < 0 ? [...current, id] : current.slice(0, index + 1);
    });
  }
  const linked = new Map<string, ConnectedGrcRow>();
  if (selected && graph) {
    for (const link of graph.links) {
      const target = link.source.id === selected.id ? link.target : link.target.id === selected.id ? link.source : null;
      if (target) linked.set(target.id, target);
    }
  }
  const showChain = !!selected && hasAssuranceChain(selected);
  const otherLinks = Array.from(linked.values()).filter(row => !showChain || !hasAssuranceChain(row));
  const data = selected?.data || {};
  const riskScore = selected?.module === "Risk Assessment" ? assessedRiskScore(data) : null;
  const facts = [
    [tr ? "Doğal risk puanı" : "Inherent risk score", riskScore === null ? null : String(riskScore)],
    [tr ? "Sorumlu" : "Owner", data.owner || data.auditOwner],
    [tr ? "Durum" : "Status", data.status],
    [tr ? "İş birimi" : "Business unit", data.businessUnit],
    [tr ? "Sonraki inceleme" : "Next review", data.nextReview],
    [tr ? "Sürüm" : "Version", selected?.module === "Kanıtlar" && (Number(data.versionNo) > 0 ? 'v' + data.versionNo : (tr ? "Sürüm kaydı yok" : "No version recorded"))],
    [tr ? "Dönem" : "Period", data.period],
  ].filter(([, value]) => typeof value === "string" && value.trim());

  return <>
    {children(inspect, open)}
    {selected && <section className="record-workspace" aria-label={tr ? "Kayıt inceleme" : "Record inspection"}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); event.preventDefault(); close(); }
      }}>
      <div className="record-master">
        <h3>{tr ? "Kayıtlar" : "Records"} <small>{visible.length}</small></h3>
        <div>{visible.map(row => <button type="button" key={row.id} aria-current={root.id === row.id ? "true" : undefined}
          onClick={() => setPath([row.id])}>
          <NavIcon module={row.module}/><span className="record-master-identity"><small>{displayRecordCode(row)}</small><b>{connectedTitle(row)}</b></span><i aria-hidden="true">›</i>
        </button>)}</div>
      </div>
      <div className="record-inspector">
        <div className="record-trail" role="group" aria-label={tr ? "Kayıt gezinmesi" : "Record navigation"}>
          <button type="button" onClick={close}>{tr ? "Listeye dön" : "Back to list"}</button>
          {path.length > 1 && <button type="button" onClick={() => setPath(current => current.slice(0,-1))}>{tr ? "Önceki kayıt" : "Previous record"}</button>}
        </div>
        <small>{moduleNames[selected.module] || selected.module} · {displayRecordCode(selected)}</small>
        <h3 ref={title} tabIndex={-1}>{connectedTitle(selected)}</h3>
        {showChain && graph && <AssuranceChain key={selected.id} inspector anchor={selected} links={graph.links} lang={lang} trail={path} openRecord={row => follow(row.id)}/>}
        <dl>{facts.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{formatValue(String(value), lang)}</dd></div>)}</dl>
        {selected.module === "Kanıtlar" && <button className="primary" type="button" onClick={() => preview(selected.id)}>{tr ? "Kanıtı önizle" : "Preview evidence"}</button>}
        {(!showChain || otherLinks.length > 0) && <h4>{showChain ? (tr ? "Diğer bağlı kayıtlar" : "Other linked records") : (tr ? "Bağlı kayıtlar" : "Linked records")}</h4>}
        {otherLinks.length ? <ul>{otherLinks.map(row => <li key={row.id}><button type="button" onClick={() => follow(row.id)}>
          <b>{connectedTitle(row)}</b><span>{moduleNames[row.module] || row.module} · {displayRecordCode(row)}</span>
        </button></li>)}</ul> : !showChain && <p>{tr ? "Bu kayda bağlı, görüntüleyebileceğin bir kayıt bulunamadı." : "No linked records are visible for this record."}</p>}
      </div>
    </section>}
  </>;
}
