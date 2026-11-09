"use client";

import { Fragment, useState } from "react";
import { connectorProfile, connectorProfiles } from "./catalog";
import ControlRunDetail from "./control-run-detail";
import { templatesForSource } from "./control-templates";
import NavIcon from "../nav-icon";
import type { AutomationRule, AutomationSource } from "../evidence-automation";
import "./evidence-workspace.css";

type Lang = "tr" | "en";
const date = (value: string | undefined, lang: Lang) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {dateStyle:"medium", timeStyle:"short"}).format(new Date(value));
};
const matches = (value: string, query: string, lang: Lang) => value.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang));
const preferred = ["intune","defender-endpoint","sonarqube"];
function Badge({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`ew-badge ${tone}`}>{children}</span>;
}

export function SourcePicker({lang, first, configure, browse}: {lang: Lang; first: boolean; configure?: (id: string) => void; browse: () => void}) {
  const tr = lang === "tr";
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState("intune");
  const profiles = query.trim() ? connectorProfiles.filter(p => matches(p.name,query,lang)) : preferred.flatMap(id => connectorProfile(id) || []);
  const active = profiles.find(p => p.id === selected) || profiles[0];
  return <div className="ew-panes ew-picker">
    <div className="ew-list"><h3>{first?(tr?"İlk kaynağınızı bağlayın":"Connect your first source"):(tr?"Kaynak ekle":"Add source")}</h3>
      <p>{tr?"Hangi üründen kanıt toplayacaksınız?":"Which product will you collect evidence from?"}</p>
      <input type="search" aria-label={tr?"Ürün ara":"Search products"} placeholder={tr?"Ürün ara…":"Search products…"} value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="ew-items">{profiles.map(p=><button key={p.id} aria-pressed={active?.id===p.id} onClick={()=>setSelected(p.id)}>
        <NavIcon module={p.id==="intune"?"Varlık Envanteri":p.id==="sonarqube"?"Kanıtlar":"Kontroller"}/>
        <span><b>{p.name}</b><small>{p.datasets[0]?.label[lang]}</small></span>
      </button>)}</div>
      {!active&&<p role="status">{tr?"Eşleşen ürün bulunamadı.":"No matching product."}</p>}
      <button className="ew-link" onClick={browse}>{tr?"Tüm kataloğu gör":"Browse full catalog"} →</button>
    </div>
    {active&&<div className="ew-detail"><h3>{active.name}</h3><h4>{tr?"Bağlantı gereksinimleri":"Connection requirements"}</h4>
      <dl className="ew-facts"><div><dt>{tr?"Gerekli izin":"Required permission"}</dt><dd>{active.datasets[0]?.permission}</dd></div>
        <div><dt>{tr?"Kimlik doğrulama":"Authentication"}</dt><dd>{active.auth==="microsoft"?(tr?"Entra uygulama kimliği":"Entra application identity"):active.secrets.map(f=>f.label[lang]).join(", ")}</dd></div>
        <div><dt>{tr?"İlk veri kümesi":"First dataset"}</dt><dd>{active.datasets[0]?.label[lang]}</dd></div></dl>
      {configure?<button className="primary" onClick={()=>configure(active.id)}>{tr?"Bağlantıyı yapılandır":"Configure connection"} →</button>:<p>{tr?"Kaynağı bağlamak için bir yöneticiye başvurun.":"Ask an administrator to connect this source."}</p>}
    </div>}
  </div>;
}

function collectionProblem(rule: AutomationRule | undefined, tr: boolean) {
  if (rule?.lastStatus !== "error") return "";
  if (rule.lastErrorCode === "ASSESSMENT_INCOMPLETE") return tr?"Alınan veriler kontrolü değerlendirmek için yetersiz.":"The collected data was insufficient to assess the control.";
  if (rule.lastErrorCode === "PERMISSION_DENIED" || rule.lastErrorCode === "AUTH_FAILED") return tr?"Son toplama tamamlanamadı. Kaynağın erişim bilgilerini ve okuma iznini doğrulayın.":"Collection failed. Verify the source credentials and read permission.";
  return tr?"Son çalışma tamamlanamadı. Hata ayrıntılarını inceleyin.":"The last run could not finish. Review the error details.";
}

type SourcesProps = {
  lang: Lang; sources: AutomationSource[]; rules: AutomationRule[]; selected: string; select: (id:string)=>void;
  canManage: boolean; busy: boolean; test: (id:string)=>void; edit: (s:AutomationSource)=>void;
  ready: (id:string)=>void; openRun: (id:string, ruleId:string)=>void; openRule: (id:string)=>void;
};
export function SourceWorkbench({lang,sources,rules,selected,select,canManage,busy,test,edit,ready,openRun,openRule}: SourcesProps) {
  const tr=lang==="tr";
  const [query,setQuery]=useState("");
  const visible=sources.filter(s=>matches(s.name+" "+s.vendor,query,lang));
  const active=visible.find(s=>s.id===selected)||visible[0];
  const linked=active?rules.filter(r=>r.sourceId===active.id):[];
  const latest=linked.filter(r=>r.lastStatus&&r.lastRunAt).sort((a,b)=>Date.parse(b.lastRunAt!)-Date.parse(a.lastRunAt!))[0];
  const captured=linked.filter(r=>r.lastEvidenceAt).sort((a,b)=>Date.parse(b.lastEvidenceAt!)-Date.parse(a.lastEvidenceAt!))[0];
  const problem=collectionProblem(latest,tr);
  const profile=connectorProfile(active?.config.providerId);
  const dataset=profile?.datasets.find(d=>d.id===active?.config.dataset);
  const connection=(s:AutomationSource)=>!s.enabled?(tr?"Duraklatıldı":"Paused"):s.lastTestStatus==="error"?(tr?"Bağlantı hatası":"Connection error"):s.lastTestStatus==="success"?(tr?"Doğrulandı":"Verified"):(tr?"Test edilmedi":"Not tested");
  const attempts=new Map<string,AutomationRule>();
  for (const rule of rules) {
    if (rule.lastStatus && rule.lastRunAt && rule.lastRunAt > (attempts.get(rule.sourceId)?.lastRunAt || "")) attempts.set(rule.sourceId,rule);
  }
  function sourceLabel(s:AutomationSource) {
    const run=attempts.get(s.id);
    if (!s.enabled || run?.lastStatus!=="error" || run.lastErrorCode==="ASSESSMENT_INCOMPLETE") return connection(s);
    if (run.lastErrorCode==="PERMISSION_DENIED" || run.lastErrorCode==="AUTH_FAILED") return tr?"Yetki gerekli":"Authorization required";
    return tr?"Çalışma hatası":"Run error";
  }
  return <div className="ew-panes ew-sources"><div className="ew-list"><h3>{tr?"Bağlı kaynaklar":"Connected sources"} <small>{sources.length}</small></h3>
    <input type="search" aria-label={tr?"Kaynaklarda ara":"Search sources"} placeholder={tr?"Kaynaklarda ara…":"Search sources…"} value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="ew-items">{visible.map(s=><button key={s.id} data-source-id={s.id} aria-pressed={s.id===active?.id} onClick={()=>select(s.id)}>
      <NavIcon module="Varlık Envanteri"/><b>{s.name}</b><Badge tone={sourceLabel(s)!==connection(s)||s.lastTestStatus==="error"?"warn":s.lastTestStatus==="success"?"ok":""}>{sourceLabel(s)}</Badge>
    </button>)}</div>{!visible.length&&<p role="status">{tr?"Eşleşen kaynak bulunamadı.":"No matching source."}</p>}</div>
    {active&&<article className="ew-detail"><header><div><h3>{active.name}</h3><p>{dataset?.label[lang]||active.vendor}</p></div>{canManage&&<button className="ghost" onClick={()=>edit(active)}>{tr?"Düzenle":"Edit"}</button>}</header>
      <div className={problem||active.lastTestStatus==="error"?"ew-notice warn":"ew-notice"}><span>{problem||(active.lastTestStatus==="error"?(tr?"Son bağlantı testi başarısız oldu.":"The last connection test failed."):(tr?"Bağlantı testi":"Connection test")+" · "+connection(active))}</span>
        {canManage&&<button className="primary" disabled={busy} onClick={()=>test(active.id)}>{tr?"Bağlantıyı doğrula":"Verify connection"}</button>}</div>
      <dl className="ew-facts"><div><dt>{tr?"Son başarılı kanıt toplama":"Last successful evidence collection"}</dt><dd>{date(captured?.lastEvidenceAt,lang)}</dd></div><div><dt>{tr?"Son çalışma denemesi":"Last run attempt"}</dt><dd>{latest?.lastRunId?<button className="ew-link" onClick={()=>openRun(latest.lastRunId!,latest.id)}>{date(latest.lastRunAt,lang)} ↗</button>:date(latest?.lastRunAt,lang)}</dd></div><div><dt>{tr?"Son bağlantı testi":"Last connection test"}</dt><dd>{date(active.lastTestAt,lang)}</dd></div></dl>
      <h4>{tr?"Son başarılı toplamadan":"From the last successful collection"}</h4>
      {captured?<div className="ew-chain"><div><small>{tr?"Kaynak":"Source"}</small><b>{active.name}</b></div>
        <div><small>{tr?"Kanıt":"Evidence"}</small>{captured.evidenceRunId?<button className="ew-link" onClick={()=>openRun(captured.evidenceRunId!,captured.id)}>{tr?"Çalışma kanıtını incele":"Inspect run evidence"} ↗</button>:<span>{tr?"Kayıt bağlantısı yok":"Record link unavailable"}</span>}</div>
        <div><small>{tr?"Kontrol":"Control"}</small><button className="ew-link" onClick={()=>openRule(captured.id)}>{captured.name} →</button></div></div>:<p>{tr?"Bu kaynak için henüz kaydedilmiş kanıt yok.":"No evidence has been recorded for this source yet."}</p>}
      {canManage&&templatesForSource(active).length>0&&<button className="ghost" onClick={()=>ready(active.id)}>{tr?"Hazır kontrol ekle":"Add ready control"}</button>}
    </article>}</div>;
}

type QueueProps = {lang:Lang; rules:AutomationRule[]; sources:AutomationSource[]; expanded:string; expand:(id:string)=>void;
  busy:boolean; role:string; run:(id:string)=>void; toggle:(r:AutomationRule)=>void};
export function ControlQueue({lang,rules,sources,expanded,expand,busy,role,run,toggle}:QueueProps) {
  const tr=lang==="tr";
  const [filter,setFilter]=useState("all");
  const attention=(r:AutomationRule)=>r.enabled&&(r.lastStatus!=="pass"||r.freshness!=="fresh");
  const visible=rules.filter(r=>filter==="all"||(filter==="attention"?attention(r):r.enabled&&r.freshness==="fresh"));
  return <div className="ew-queue"><div className="ew-filters">{[["all",tr?"Tümü":"All"],["attention",tr?"İnceleme gerekli":"Needs review"],["fresh",tr?"Güncel kanıt":"Fresh evidence"]].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    {visible.length?<div className="ew-table-wrap"><table><thead><tr>{(tr?["Kontrol","Kaynak","Son test","Sonuç"]:["Control","Source","Last test","Result"]).map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>
      {visible.map(r=>{const open=expanded===r.id;
        const status=r.lastStatus==="pass"?(r.freshness==="unknown"?(tr?"Doğrulanamadı":"Unverified"):(tr?"Başarılı":"Passed")):r.lastStatus==="fail"?(tr?"Başarısız":"Failed"):r.lastStatus==="error"?(r.lastErrorCode==="ASSESSMENT_INCOMPLETE"?(tr?"Yetersiz veri":"Insufficient data"):r.lastErrorCode?(tr?"Çalışma hatası":"Run error"):(tr?"Doğrulanamadı":"Unverified")):(tr?"Henüz değerlendirilmedi":"Not yet assessed");
        return <Fragment key={r.id}><tr className={open?"ew-selected":""}><th scope="row"><button data-rule-id={r.id} aria-expanded={open} onClick={()=>expand(open?"":r.id)}><span aria-hidden="true">{open?"⌄":"›"}</span>{r.name}</button></th><td data-label={tr?"Kaynak":"Source"}>{sources.find(s=>s.id===r.sourceId)?.name||"—"}</td><td data-label={tr?"Son test":"Last test"}>{date(r.lastStatus?r.lastRunAt:undefined,lang)}</td><td><Badge tone={r.lastStatus==="pass"&&r.freshness!=="unknown"?"ok":r.lastStatus==="fail"?"bad":r.lastStatus==="error"?"warn":""}>{status}</Badge>{!r.enabled&&<small>{tr?"Duraklatıldı":"Paused"}</small>}</td></tr>
        {open&&<tr className="ew-expanded"><td colSpan={4}>
          {r.lastRunId&&r.lastStatus?<ControlRunDetail compact runId={r.lastRunId} expectedRuleId={r.id} lang={lang}/>:<p>{r.lastStatus?(tr?"Bu sonuç için çalışma bağlantısı bulunamadı.":"No run link is available for this result."):(tr?"İlk değerlendirme bekleniyor.":"Awaiting the first assessment.")}</p>}
          <div className="ew-rule-meta"><span>{tr?"Kanıt tazeliği":"Evidence freshness"} · {({fresh:tr?"Güncel":"Fresh",stale:tr?"Eski":"Stale",missing:tr?"Eksik":"Missing",expiring:tr?"Süresi doluyor":"Expiring"} as Record<string,string>)[r.freshness]||(tr?"Doğrulanamadı":"Unverified")}</span><span>{tr?"Bağlı kontroller":"Mapped controls"} · {r.controlRefs||"—"}</span><span>{tr?"Sonraki çalışma":"Next run"} · {date(r.nextRunAt,lang)}</span>
          {role!=="Viewer"&&<button className="ghost" disabled={busy||!r.enabled} onClick={()=>run(r.id)}>{tr?"Çalıştır":"Run"}</button>}{role==="Admin"&&<button className="ghost" disabled={busy} onClick={()=>toggle(r)}>{r.enabled?(tr?"Duraklat":"Pause"):(tr?"Etkinleştir":"Enable")}</button>}</div>
        </td></tr>}</Fragment>;})}
    </tbody></table></div>:<p className="ew-empty">{rules.length?(tr?"Bu filtreyle eşleşen kontrol yok.":"No controls match this filter."):(tr?"Henüz değerlendirilmedi. İlk sonuç için bir kaynağa kontrol ekleyin.":"Not yet assessed. Add a control to a source to get its first result.")}</p>}</div>;
}
