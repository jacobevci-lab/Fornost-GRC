"use client";

import { useContext, useMemo, useState } from "react";
import { connectedTitle } from "../connected-grc-model";
import { ModuleTrailContext } from "../module-record-trail-view";
import { foldSearch } from "../record-search-store";

const kinds = [
  { module: "Varlık Envanteri", field: "assetRefs", tr: "Varlık", en: "Asset" },
  { module: "Risk Assessment", field: "riskRef", tr: "Risk", en: "Risk" },
  { module: "BIA", field: "biaRef", tr: "İş etki analizi", en: "Business impact analysis" },
] as const;
type Kind = typeof kinds[number];
type IncidentDraft = Record<string, string | boolean>;
type Props = {
  tr: boolean;
  form: IncidentDraft;
  setForm: (next: IncidentDraft) => void;
};

export function IncidentReferenceSearch({ tr, form, setForm }: Props) {
  const directory = useContext(ModuleTrailContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const needle = foldSearch(query.trim());
  const rows = directory?.coreState === "ready" ? directory.rows : undefined;
  const matches = useMemo(() => {
    if (!open || needle.length < 2 || !rows) return [];
    const results = [];
    for (const row of rows) {
      const kind = kinds.find(candidate => candidate.module === row.module);
      if (!kind) continue;
      const title = connectedTitle(row);
      if (foldSearch([title, row.code, row.id].join(" ")).includes(needle)) {
        results.push({ row, kind, title });
        if (results.length > 20) break;
      }
    }
    return results;
  }, [rows, open, needle]);

  function link(kind: Kind, id: string, code: string | undefined, title: string) {
    const previous = String(form[kind.field] || "");
    const refs = previous.split(/[;,|\r\n]+/).map(ref => ref.trim()).filter(Boolean);
    const alreadyLinked = refs.some(ref => [id, code].some(alias => alias && alias.toLowerCase() === ref.toLowerCase()));
    if (alreadyLinked) {
      setNotice(tr ? title + " zaten bağlı." : title + " is already linked.");
      return;
    }
    const value = kind.field === "assetRefs" ? [...refs, id].join(", ") : id;
    if (value.length > (kind.field === "assetRefs" ? 1000 : 120)) {
      setNotice(tr ? "Referans alanındaki karakter sınırı aşılıyor." : "This selection exceeds the reference field length limit.");
      return;
    }
    setForm({ ...form, [kind.field]: value });
    setNotice(tr ? title + " bağlandı." : title + " linked.");
  }

  return <details className="incident-reference-search" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{tr ? "Varlık, risk veya BIA kaydı bul ve bağla" : "Find and link an asset, risk or BIA record"}</summary>
    {open && (directory?.coreState === "ready" ? <>
      <p>{tr ? "Birden fazla varlık ekleyebilirsiniz. Risk ve BIA seçimleri ilgili alandaki değeri değiştirir." : "Add multiple assets. Selecting a risk or BIA record replaces the value in that field."}</p>
      <label>{tr ? "Kayıt adı veya kodu" : "Record name or code"}
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setNotice(""); }}
          placeholder={tr ? "En az iki karakter yazın" : "Enter at least two characters"}
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}/>
      </label>
      {needle.length >= 2 && (matches.length ? <ul>{matches.slice(0,20).map(({row,kind,title}) =>
        <li key={row.id}><button type="button" onClick={() => link(kind, row.id, row.code, title)}>
          {tr ? kind.tr : kind.en} · {title}{row.code && row.code !== title ? " · " + row.code : ""}
        </button></li>)}</ul> : <p role="status">{tr ? "Eşleşen kayıt yok." : "No matching records."}</p>)}
      {matches.length > 20 && <p>{tr ? "İlk 20 sonuç gösteriliyor. Aramayı daraltın." : "Showing the first 20 matches. Refine your search."}</p>}
      <span role="status">{notice}</span>
    </> : <p role="status">{directory?.coreState === "loading"
      ? (tr ? "Kayıtlar yükleniyor…" : "Loading records…")
      : <>{tr ? "Kayıtlar yüklenemedi. " : "Records could not be loaded. "}<button type="button" onClick={directory?.retryCore}>{tr ? "Tekrar dene" : "Retry"}</button></>}</p>)}
  </details>;
}
