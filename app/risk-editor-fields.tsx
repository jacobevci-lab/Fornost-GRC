"use client";
import { useEffect, useId, useRef, useState } from "react";
import { connectionValues } from "./connected-grc-workbench-model";
import { useChoices } from "./workflow-selection-fields";
import { normalizeRiskSearch, type RiskRecordOptions } from "./risk-record-options";
import "./risk-editor-fields.css";

type Option = { value: string; label: string; search?: string };
type Props = { tr: boolean; form: Record<string, unknown>; update: (patch: Record<string,string>) => void };
type DirectoryPerson = { name: string; email: string };

function ChoiceInput({ label, options, query, onQuery, choose, tr, required, pending, message, more }: {
  label: string; options: Option[]; query: string; onQuery: (text: string) => void;
  choose: (value: string) => void; tr: boolean; required?: boolean; pending?: boolean; message?: string; more?: boolean;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [index, setIndex] = useState(-1);
  const results = options.slice(0,50), active = open && results[index] ? id + "-" + index : undefined;
  useEffect(() => { if (active) document.getElementById(active)?.scrollIntoView({block:"nearest"}); }, [active]);
  useEffect(() => {
    input.current?.setCustomValidity(required ? (tr ? "Listeden bir kişi seçin veya sistem dışı sorumlu girin." : "Select a person or enter an external owner.") : "");
  }, [required, tr]);
  function select(value: string) {
    choose(value); onQuery(""); setIndex(-1); setOpen(false);
  }
  return <div className="risk-choice" data-escape-layer={open || undefined}>
    <label htmlFor={id}>{label}</label>
    <input id={id} ref={input} role="combobox" autoComplete="off" aria-expanded={open}
      aria-autocomplete="list" aria-controls={open ? id+"-options" : undefined} aria-activedescendant={active}
      aria-required={required || undefined} value={query} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={event => { onQuery(event.target.value); setIndex(-1); setOpen(true); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && open) {
          event.preventDefault(); event.stopPropagation(); onQuery(""); setOpen(false); setIndex(-1);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setIndex(i => Math.min(results.length-1, Math.max(0, i + (event.key === "ArrowDown" ? 1 : -1))));
        } else if (event.key === "Enter" && open) {
          event.preventDefault(); if (results[index]) select(results[index].value);
        }
      }} />
    {open && <><ul id={id+"-options"} role="listbox" aria-label={label} aria-busy={pending}>
      {results.map((option,i) => <li id={id+"-"+i} role="option" aria-selected={index===i} key={option.value}
        onMouseDown={e => e.preventDefault()} onClick={() => select(option.value)}>{option.label}</li>)}
    </ul><small role="status">{message || (pending ? (tr?"Yükleniyor…":"Loading…") : !results.length
      ? (tr?"Eşleşme yok":"No matches") : more || options.length>50 ? (tr?"Daha fazla sonuç için aramayı daraltın.":"Narrow your search for more results.") : "")}</small></>}
  </div>;
}
function matches(option: Option, query: string) {
  return normalizeRiskSearch([option.label,option.search,option.value].join(" ")).includes(normalizeRiskSearch(query));
}

export function RiskControls({form, update, catalog, tr}: Props & { catalog: RiskRecordOptions }) {
  const [query,setQuery] = useState("");
  const selected = [...new Set(connectionValues(form.existingControls))];
  const selectedRows = new Set(selected.map(catalog.resolve));
  const options = catalog.options.filter(o => !selectedRows.has(catalog.resolve(o.value)) && matches(o,query));
  return <fieldset className="wide risk-editor-group" data-form-group="advanced">
    <legend>{tr?"Mevcut Kontroller":"Existing Controls"}</legend>
    <ChoiceInput tr={tr} label={tr?"Kontrol kodu veya başlığı ara":"Search control code or title"} query={query} onQuery={setQuery}
      options={options} choose={ref => update({existingControls:[...selected,ref].join("; ")})} />
    <div className="risk-pills">{selected.map(ref => {
      const row=catalog.resolve(ref), label=row?catalog.label(row):ref;
      return <button key={ref} type="button" aria-label={(tr?"Kaldır · ":"Remove · ")+label}
        onClick={() => update({existingControls:selected.filter(item=>item!==ref).join("; ")})}>{label} <span aria-hidden="true">×</span></button>;
    })}</div>
    <label>{tr?"Kontrol Uygulama Notu (isteğe bağlı)":"Control implementation note (optional)"}
      <textarea name="controlImplementationNote" maxLength={2000} rows={2} value={String(form.controlImplementationNote||"")}
        onChange={e=>update({controlImplementationNote:e.target.value})}/></label>
  </fieldset>;
}

export function RiskAssets({form,update,catalog,tr}: Props & { catalog: RiskRecordOptions }) {
  const [query,setQuery]=useState("");
  const organization=form.riskScope==="organization", selected=[...new Set(connectionValues(form.asset))];
  const selectedRows=new Set(selected.map(catalog.resolve));
  const options=catalog.options.filter(o => matches(o,query));
  const search=useRef<HTMLInputElement>(null);
  useEffect(()=>{search.current?.setCustomValidity(!organization && !selected.length
    ? (tr?"En az bir varlık seçin.":"Select at least one asset.") : "");},[organization,selected.length,tr]);
  function toggle(ref:string) {
    const row=catalog.resolve(ref);
    const next=selectedRows.has(row) ? selected.filter(item=>catalog.resolve(item)!==row) : [...selected,ref];
    update({asset:next.join(", "),riskScope:"asset"});
  }
  return <fieldset className="wide risk-editor-group" data-form-group="core">
    <legend>{tr?"İlgili Varlık":"Related Asset"}</legend>
    <div className="risk-scope" role="group" aria-label={tr?"Risk kapsamı":"Risk scope"}>
      <button type="button" aria-pressed={!organization} onClick={()=>update({riskScope:"asset"})}>{tr?"Varlığa Bağlı Risk":"Asset-linked risk"}</button>
      <button type="button" aria-pressed={organization} onClick={()=>{setQuery("");update({riskScope:"organization",asset:""});}}>
        {tr?"Kurum Düzeyi Risk (Belirli bir varlığa bağlı değil)":"Organization-level risk (not tied to a specific asset)"}</button>
    </div>
    <fieldset className="risk-asset-options" disabled={organization} aria-label={tr?"Varlık seçimi":"Asset selection"}>
      <label>{tr?"Varlık adı veya kodu ara":"Search asset name or code"}<input ref={search} type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="risk-asset-list">{options.map(o=><button type="button" key={o.value} aria-pressed={selectedRows.has(catalog.resolve(o.value))}
        onClick={()=>toggle(o.value)}>{o.label}</button>)}</div>
      {!organization && !options.length && <small>{tr?"Eşleşen varlık yok.":"No matching assets."}</small>}
    </fieldset>
    {!organization && selected.length>0 && <div className="risk-pills">{selected.map(ref=>{
      const row=catalog.resolve(ref), label=row?catalog.label(row):ref;
      return <button key={ref} type="button" aria-label={(tr?"Kaldır · ":"Remove · ")+label}
        onClick={()=>update({asset:selected.filter(item=>item!==ref).join(", ")})}>{label} <span aria-hidden="true">×</span></button>;
    })}</div>}
  </fieldset>;
}

export function RiskPerson({tr,form,update,field}: Props & {field:"owner"|"actionOwner"}) {
  const [query,setQuery]=useState("");
  const emailKey=field==="owner"?"ownerEmail":"actionOwnerEmail", sourceKey=field+"Source";
  const name=String(form[field]||""), email=String(form[emailKey]||"");
  const manual=form[sourceKey]==="external" || (!form[sourceKey] && Boolean(name||email));
  const directory=useChoices<{people?:DirectoryPerson[];complete?:boolean}>(manual?null:"/api/grc/risk-owners?q="+encodeURIComponent(query));
  const people=directory.data.people || [], label=field==="owner"?(tr?"Sahibi":"Owner"):(tr?"Aksiyon Sahibi":"Action owner");
  function changeMode() { setQuery(""); update({[sourceKey]:manual?"directory":"external",[field]:"",[emailKey]:""}); }
  return <fieldset className="risk-editor-group" data-form-group={field==="owner"?"core":"advanced"}>
    <legend>{label}</legend>
    {manual ? <><label>{tr?"Adı soyadı":"Full name"}<input name={field} required={field==="owner"} value={name} onChange={e=>update({[field]:e.target.value})}/></label>
      <label>{tr?"E-posta adresi":"Email address"}<input name={emailKey} type="email" maxLength={254} value={email} onChange={e=>update({[emailKey]:e.target.value})}/></label></>
      : <>{(name || email) && <div className="risk-pills"><button type="button" aria-label={(tr?"Kaldır · ":"Remove · ")+name} onClick={()=>update({[field]:"",[emailKey]:""})}>{[name,email].filter(Boolean).join(" · ")} ×</button></div>}
        <ChoiceInput tr={tr} label={label+(tr?" · ad veya e-posta ara":" · search name or email")} required={field==="owner"&&!name}
          query={query} onQuery={setQuery} pending={directory.loading} more={directory.data.complete===false}
          message={directory.error?(tr?"Kişiler yüklenemedi.":"People could not be loaded."):undefined}
          options={people.map(p=>({value:p.email,label:[p.name,p.email].filter(Boolean).join(" · ")}))}
          choose={value=>{const person=people.find(p=>p.email===value);if(person)update({[field]:person.name||person.email,[emailKey]:person.email,[sourceKey]:"directory"});}} />
        {directory.error && <button type="button" onClick={directory.retry}>{tr?"Yeniden dene":"Retry"}</button>}</>}
    <button className="risk-mode-link" type="button" onClick={changeMode}>{manual?(tr?"Kullanıcı dizininden seç":"Choose from directory"):(tr?"Sistem dışı sorumlu gir":"Enter an external owner")}</button>
  </fieldset>;
}
