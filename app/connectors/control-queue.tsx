"use client";

import { useId, useState } from "react";
import type { AutomationRule, AutomationSource } from "../evidence-automation";
import ControlRunDetail from "./control-run-detail";
import { controlQueueGroup, filterQueueRules, queueGroups, type QueueGroup } from "./control-queue-model";

type Props = {
  lang: "tr" | "en"; rules: AutomationRule[]; sources: AutomationSource[];
  expanded: string; expand: (id: string) => void; busy: boolean; role: string;
  run: (id: string) => void; toggle: (rule: AutomationRule) => void;
  refresh: () => Promise<void>; openSource: (id: string) => void;
};
const formatDate = (value: string | undefined, tr: boolean) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat(tr ? "tr-TR" : "en-GB", {dateStyle: "medium", timeStyle: "short"}).format(new Date(value)) : "—";

export function ControlQueue({lang, rules, sources, expanded, expand, busy, role, run, toggle, refresh, openSource}: Props) {
  const tr = lang === "tr", id = useId();
  const [view, setView] = useState("priority"), [query, setQuery] = useState("");
  const [owner, setOwner] = useState(""), [filter, setFilter] = useState("all"), [refreshing, setRefreshing] = useState(false);
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const visible = filterQueueRules(rules, sources, query, owner, filter, lang);
  const owners = [...new Set(rules.map(rule => rule.remediationOwner?.trim()).filter((value): value is string => !!value))].sort((a,b) => a.localeCompare(b, lang));
  const groups = Object.fromEntries(queueGroups.map(group => [group, visible.filter(rule => controlQueueGroup(rule, sourceMap.get(rule.sourceId)) === group)])) as Record<QueueGroup, AutomationRule[]>;
  const labels = tr ? {failed:"Başarısız kontroller", verify:"Doğrulama veya güncel kanıt gerekli", current:"Güncel ve başarılı", paused:"Duraklatılan kontroller"}
    : {failed:"Failed controls", verify:"Verification or fresh evidence needed", current:"Current and passing", paused:"Paused controls"};
  const sourceGroups = [...new Set(visible.map(rule => rule.sourceId))].map(sourceId => ({sourceId, source:sourceMap.get(sourceId), rules:visible.filter(rule => rule.sourceId === sourceId)}));
  const pending = busy || refreshing;
  const freshness = (rule: AutomationRule) => ({fresh:tr?"Güncel kanıt":"Fresh evidence", stale:tr?"Kanıt süresi geçmiş":"Stale evidence", missing:tr?"Kanıt eksik":"Missing evidence", expiring:tr?"Kanıt süresi doluyor":"Evidence expiring"} as Record<string,string>)[rule.freshness] || (tr?"Kanıt doğrulanamadı":"Evidence unverified");
  function result(rule: AutomationRule) {
    if (rule.lastStatus === "fail") return {label:tr?"Başarısız":"Failed", tone:"bad"};
    if (rule.lastStatus === "pass" && rule.freshness === "unknown") return {label:tr?"Doğrulanamadı":"Unverified", tone:"warn"};
    if (rule.lastStatus === "pass") return controlQueueGroup(rule,sourceMap.get(rule.sourceId)) === "current"
      ? {label:tr?"Başarılı":"Passed", tone:"ok"} : {label:tr?"Son test başarılı":"Last test passed", tone:""};
    if (rule.lastStatus === "error") return {label:rule.lastErrorCode === "ASSESSMENT_INCOMPLETE" ? (tr?"Yetersiz veri":"Insufficient data") : rule.lastErrorCode ? (tr?"Çalışma hatası":"Run error") : (tr?"Doğrulanamadı":"Unverified"), tone:"warn"};
    return {label:tr?"Henüz değerlendirilmedi":"Not yet assessed", tone:""};
  }
  function renderRule(rule: AutomationRule, compact = false) {
    const open = expanded === rule.id, source = sourceMap.get(rule.sourceId), status = result(rule);
    const detailId = `${id}-${encodeURIComponent(rule.id)}`, triggerId = `${detailId}-trigger`;
    return <article key={rule.id} className={`ew-control ${open ? "ew-selected" : ""}`} data-control-id={rule.id}
      onKeyDown={event => {if (event.key === "Escape" && open) {event.stopPropagation(); expand(""); event.currentTarget.querySelector<HTMLButtonElement>("button[data-rule-id]")?.focus();}}}>
      <button type="button" className="ew-control-trigger" id={triggerId} data-rule-id={rule.id} aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => expand(open ? "" : rule.id)}>
        <span className="ew-control-name"><b>{rule.name}</b><small>{rule.controlRefs || rule.id}</small></span>
        {!compact && <span className="ew-control-source">{source?.name || (tr?"Kaynak kullanılamıyor":"Source unavailable")}<small>{rule.remediationOwner?.trim() || (tr?"Sorumlu atanmamış":"Unassigned")}</small></span>}
        <span className="ew-control-status"><span className={`ew-badge ${status.tone}`}>{status.label}</span><small>{!rule.enabled ? (tr?"Duraklatıldı":"Paused") : freshness(rule)}</small></span>
        <span className="ew-control-inspect">{tr?"İncele":"Inspect"} <span aria-hidden="true">{open?"⌄":"›"}</span></span>
      </button>
      {open && <div id={detailId} className="ew-expanded" role="region" aria-labelledby={triggerId}>
        {!source && <p className="ew-notice warn">{tr?"Bağlı kaynak bulunamadı veya erişilemiyor. Kayıt ve çalışma geçmişi korunuyor.":"The linked source is missing or unavailable. The control and run history are retained."}</p>}
        {source && !source.enabled && <p className="ew-notice">{tr?"Kaynak duraklatılmış; yeni veri toplanamıyor.":"The source is paused; new data cannot be collected."}</p>}
        {rule.lastRunId && rule.lastStatus ? <ControlRunDetail compact runId={rule.lastRunId} expectedRuleId={rule.id} lang={lang}/> : <p>{rule.lastStatus ? (tr?"Bu sonuç için çalışma bağlantısı bulunamadı.":"No run link is available for this result.") : (tr?"İlk değerlendirme bekleniyor.":"Awaiting the first assessment.")}</p>}
        <dl className="ew-control-facts">
          <div><dt>{tr?"Son test":"Last test"}</dt><dd>{formatDate(rule.lastStatus ? rule.lastRunAt : undefined, tr)}</dd></div>
          <div><dt>{tr?"Sorumlu":"Owner"}</dt><dd>{rule.remediationOwner?.trim() || (tr?"Atanmamış":"Unassigned")}</dd></div>
          <div><dt>{tr?"Sonraki çalışma":"Next run"}</dt><dd>{rule.enabled ? formatDate(rule.nextRunAt,tr) : "—"}</dd></div>
        </dl>
        <div className="ew-rule-meta"><span>{freshness(rule)}</span>
          {source && <button className="ghost" onClick={()=>openSource(source.id)}>{tr?"Kaynağı incele":"Inspect source"}</button>}
          {role !== "Viewer" && <button className="ghost" disabled={pending || !rule.enabled || !source?.enabled} onClick={()=>run(rule.id)}>{tr?"Çalıştır":"Run"}</button>}
          {role === "Admin" && <button className="ghost" disabled={pending || (!rule.enabled && !source)} onClick={()=>toggle(rule)}>{rule.enabled ? (tr?"Duraklat":"Pause") : (tr?"Etkinleştir":"Enable")}</button>}
        </div>
      </div>}
    </article>;
  }
  return <div className="ew-queue" data-view={view} aria-busy={refreshing}>
    <div className="ew-queue-toolbar">
      <label className="ew-queue-search"><span>{tr?"Kontrol veya kaynak ara":"Search controls or sources"}</span><input type="search" placeholder={tr?"Ad, kod veya kaynak…":"Name, code or source…"} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label><span>{tr?"Sorumlu":"Owner"}</span><select value={owner} onChange={event=>setOwner(event.target.value)}><option value="">{tr?"Tümü":"All"}</option><option value="unassigned">{tr?"Atanmamış":"Unassigned"}</option>{owners.map(value=><option key={value} value={`owner:${value}`}>{value}</option>)}</select></label>
      <label><span>{tr?"Görünüm":"View"}</span><select value={view} onChange={event=>setView(event.target.value)}><option value="priority">{tr?"Öncelik":"Priority"}</option><option value="source">{tr?"Kaynak":"Source"}</option></select></label>
      <button className="ghost" disabled={pending} onClick={async()=>{setRefreshing(true);try{await refresh();}finally{setRefreshing(false);}}}>{refreshing ? (tr?"Yenileniyor…":"Refreshing…") : (tr?"Yenile":"Refresh")}</button>
    </div>
    <div className="ew-queue-scope"><div className="ew-filters">{[["all",tr?"Tümü":"All"],["attention",tr?"İnceleme gerekli":"Needs review"],["fresh",tr?"Güncel kanıt":"Fresh evidence"]].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
      {(query || owner || filter !== "all") && <button className="ew-link" onClick={()=>{setQuery("");setOwner("");setFilter("all");}}>{tr?"Filtreleri temizle":"Clear filters"}</button>}
    </div>
    <p className="ew-queue-counts" role="status">{tr ? `${visible.length} / ${rules.length} kontrol · ${groups.failed.length} başarısız · ${groups.verify.length} inceleme gerekli · ${groups.current.length} güncel ve başarılı · ${groups.paused.length} duraklatıldı` : `${visible.length} / ${rules.length} controls · ${groups.failed.length} failed · ${groups.verify.length} need review · ${groups.current.length} current and passing · ${groups.paused.length} paused`}</p>
    {!visible.length ? <p className="ew-empty">{rules.length ? (tr?"Bu filtrelerle eşleşen kontrol yok.":"No controls match these filters.") : (tr?"Henüz kontrol yok. İlk değerlendirme için bir kaynağa kontrol ekleyin.":"No controls yet. Add a control to a source for its first assessment.")}</p> : view === "priority" ?
      <div className="ew-priority-groups">{queueGroups.filter(group=>groups[group].length).map(group=><section key={group} className={`ew-priority-group ${group}`} data-queue-group={group} aria-label={labels[group]}>
        <h4>{labels[group]} <span>{groups[group].length}</span></h4>{groups[group].map(rule=>renderRule(rule))}
      </section>)}</div> : <div className="ew-source-grid">{sourceGroups.map(group=>{
        const source = group.source;
        const connection = !source ? (tr?"Kaynak kullanılamıyor":"Source unavailable") : !source.enabled ? (tr?"Duraklatıldı":"Paused") : source.lastTestStatus === "success" ? (tr?"Bağlantı testi başarılı":"Connection test passed") : source.lastTestStatus === "error" ? (tr?"Bağlantı hatası":"Connection error") : (tr?"Test edilmedi":"Not tested");
        const failed = group.rules.filter(rule=>controlQueueGroup(rule,source)==="failed").length;
        const needsReview = group.rules.filter(rule=>controlQueueGroup(rule,source)==="verify").length;
        return <section key={group.sourceId} className="ew-source-group" data-source-group={group.sourceId}>
          <header><div><h4>{source?.name || (tr?"Kaynak kullanılamıyor":"Source unavailable")}</h4><p>{source ? (tr?"Son bağlantı testi":"Last connection test")+" · "+formatDate(source.lastTestAt,tr) : group.sourceId}</p></div><span className={`ew-badge ${source?.enabled && source.lastTestStatus === "error" ? "warn" : ""}`}>{connection}</span></header>
          <p className="ew-source-counts">{tr ? `${group.rules.length} kontrol · ${failed} başarısız · ${needsReview} inceleme gerekli` : `${group.rules.length} controls · ${failed} failed · ${needsReview} need review`}</p>
          {group.rules.map(rule=>renderRule(rule,true))}
          {source && <footer><button className="ew-link" onClick={()=>openSource(source.id)}>{tr?"Kaynak ayrıntısını aç":"Open source details"} →</button></footer>}
        </section>;
      })}</div>}
    <p className="ew-queue-note">{tr?"Sıralama son sonuç ve kanıt güncelliğine göredir. Bağlantı testi, kontrollerin başarılı olduğunu göstermez.":"Priority follows the latest result and evidence freshness. A connection test does not establish that controls pass."}</p>
  </div>;
}
