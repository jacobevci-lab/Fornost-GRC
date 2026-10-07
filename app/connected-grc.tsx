"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, connectedRelationLabels, connectedRemediationModule, connectedTitle, type ConnectedGrcRow } from "./connected-grc-model";
import { filterConnectedGrcGaps, type ConnectedGapType } from "./connected-grc-gaps";
import { connectedGrcExport, connectedGrcGapExport } from "./connected-grc-export";
import { connectedGrcNavigation } from "./connected-grc-navigation";
import { buildConnectedGrcEnterpriseRows, connectedGrcEndpoints } from "./connected-grc-sources";
import { buildContinuousAssuranceChains, summarizeContinuousAssurance } from "./continuous-assurance-chain";
import ContinuousAssuranceWorkQueue from "./continuous-assurance-work-queue";
import ContinuousAssuranceGovernance from "./continuous-assurance-governance";
import ContinuousAssuranceEscalationCenter from "./continuous-assurance-escalation-center";
import { navigateToFornost } from "./navigation-focus";
import { connectedSourceIssueText } from "./connected-grc-source-status";
import { loadConnectedGrcSources } from "./connected-grc-loader";
import "./connected-grc-contract.css";
import "./connected-assurance-posture.css";
import "./connected-grc-explorer.css";

type Lang = "tr" | "en";
const moduleNames:Record<string,string>={"Varlık Envanteri":"Asset Inventory","Kontroller":"Control Library","Kanıtlar":"Evidence Library","Denetim Yönetimi":"Audit Management","Uyum":"Compliance Management","Tedarikçiler":"Vendor Management","Politika Merkezi":"Policy Center","Bulgular ve CAPA":"Findings & CAPA","Kanıt Otomasyonu":"Evidence Automation","İş Sürekliliği":"Business Continuity","Güvenlik Olayları":"Security Incidents","Regülasyon Merkezi":"Regulatory Change","Risk İştahı ve KRI":"Risk Appetite & KRI","AI Yönetişimi":"AI Governance"};
const ignored = new Set(["Ana Sayfa","Bağlantılı GRC","Raporlar"]);

export default function ConnectedGrc({rows,lang,go,includeAi=false}:{rows:ConnectedGrcRow[];lang:Lang;go:(module:string)=>void;includeAi?:boolean}){
  const tr=lang==="tr",[module,setModule]=useState("all"),[query,setQuery]=useState("");
  const moduleLabel=(name:string)=>tr?name:(moduleNames[name]||name);
  const [view,setView]=useState<"explore"|"gaps"|"assurance">("explore");
  const recordList=useRef<HTMLElement>(null);
  const [selectedId,setSelectedId]=useState("");
  const [page,setPage]=useState(0);
  const [linkLimit,setLinkLimit]=useState(8);
  const [gapLimit,setGapLimit]=useState(12);
  const [referenceLimit,setReferenceLimit]=useState(20);
  const [gapQuery,setGapQuery]=useState("");
  const [gapModule,setGapModule]=useState("all");
  const [gapType,setGapType]=useState<ConnectedGapType>("all");
  const [sourceReload,setSourceReload]=useState(0);
  const [sourceSnapshot,setSourceSnapshot]=useState<{
    includeAi:boolean; reload:number; rows:ConnectedGrcRow[];
    result:Awaited<ReturnType<typeof loadConnectedGrcSources>>;
  }|null>(null);
  const activeSnapshot=sourceSnapshot?.includeAi===includeAi&&sourceSnapshot.reload===sourceReload?sourceSnapshot:null;
  const enterpriseRows=useMemo(()=>activeSnapshot?.rows||[],[activeSnapshot]);
  const sourceState={ready:activeSnapshot?.result.ready||0,total:connectedGrcEndpoints(includeAi).length,loading:!activeSnapshot};

  useEffect(()=>{
    const controller=new AbortController();
    let current=true;
    void loadConnectedGrcSources({includeAi,signal:controller.signal}).then(result=>{
      if(!current)return;
      setSourceSnapshot({includeAi,reload:sourceReload,rows:buildConnectedGrcEnterpriseRows(result.payloads),result});
    });
    return()=>{current=false;controller.abort();};
  },[includeAi,sourceReload]);

  const sourcesComplete=!sourceState.loading&&sourceState.ready===sourceState.total;
  const coverageNotice=sourceState.loading?(tr?"Kaynaklar yükleniyor; tamlık ve güvence değerlendirmesi bekleniyor.":"Sources are loading; completeness and assurance assessment is pending."):(tr?"Kaynaklar eksik: bağlantı eksikleri ön değerlendirmedir; toplam tamlık ve güvence sonucu hesaplanmadı.":"Sources are incomplete: connection gaps are provisional; overall completeness and assurance were not assessed.");

  const records=useMemo(()=>{
    const merged=new Map<string,ConnectedGrcRow>();
    for(const row of [...rows,...enterpriseRows]) if(!ignored.has(row.module) && (includeAi || row.module!=="AI Yönetişimi")) merged.set(row.id,row);
    return Array.from(merged.values());
  },[rows,enterpriseRows,includeAi]);
  const graph=useMemo(()=>buildConnectedGrcGraph(records),[records]),links=graph.links,unresolved=graph.unresolved;
  const coverage=useMemo(()=>assessConnectedGrcCoverage(records,links),[records,links]);
  const assuranceChains=useMemo(()=>buildContinuousAssuranceChains(records,links),[records,links]);
  const assuranceSummary=useMemo(()=>summarizeContinuousAssurance(assuranceChains),[assuranceChains]);
  const modules=useMemo(()=>Array.from(new Set(records.map(row=>row.module))).sort(),[records]);
  const gapResults=filterConnectedGrcGaps(coverage.gaps,unresolved,{query:gapQuery,module:gapModule,type:gapType,lang,moduleLabel});
  const gapFiltersActive=Boolean(gapQuery.trim()||gapModule!=="all"||gapType!=="all");
  function resetGapLimits(){setGapLimit(12);setReferenceLimit(20)}
  const linkedIds=new Set(links.flatMap(link=>[link.source.id,link.target.id]));
  const needle=query.trim().toLocaleLowerCase(tr?"tr-TR":"en-US");
  const matchingRecords=records.filter(row=>(module==="all"||row.module===module)&&(!needle||`${row.code||row.id} ${connectedTitle(row)} ${row.module} ${moduleLabel(row.module)}`.toLocaleLowerCase(tr?"tr-TR":"en-US").includes(needle)));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(matchingRecords.length/10)-1));
  const visibleRecords=matchingRecords.slice(currentPage*10,currentPage*10+10);
  const selected=visibleRecords.find(row=>row.id===selectedId)||visibleRecords[0];
  useEffect(()=>{
    const list=recordList.current,active=list?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if(!list||!active)return;
    if(active.offsetTop<list.scrollTop+50)list.scrollTop=Math.max(0,active.offsetTop-50);
    else if(active.offsetTop+active.offsetHeight>list.scrollTop+list.clientHeight-65)list.scrollTop=active.offsetTop+active.offsetHeight-list.clientHeight+65;
  },[selected?.id,view]);
  const selectedLinks=selected?links.filter(link=>link.source.id===selected.id||link.target.id===selected.id):[];
  const filtered=links.filter(link=>(module==="all"||link.source.module===module||link.target.module===module)&&(!needle||[link.source,link.target].some(row=>`${row.code||row.id} ${connectedTitle(row)} ${row.module} ${moduleLabel(row.module)}`.toLocaleLowerCase(tr?"tr-TR":"en-US").includes(needle))));
  function selectRecord(id:string){setSelectedId(id);setLinkLimit(8)}
  function followConnection(row:ConnectedGrcRow){setModule("all");setQuery("");setPage(Math.max(0,Math.floor(records.findIndex(item=>item.id===row.id)/10)));selectRecord(row.id)}
  function resetFilters(){setModule("all");setQuery("");setPage(0);setLinkLimit(8)}
  function openRecord(row:ConnectedGrcRow){
    const target=connectedGrcNavigation(row);
    if(!target){go(row.module);return;}
    navigateToFornost({module:target.module,ref:target.ref,kind:target.kind,source:"connected-grc-register",filter:{[target.filterKey]:target.ref}});
  }
  function download(gaps=false){
    const scope={...sourceState,generatedAt:new Date().toISOString()};
    const result=gaps?connectedGrcGapExport(gapResults.gaps,gapResults.unresolved,scope,{query:gapQuery,module:gapModule,type:gapType}):connectedGrcExport(filtered,scope);
    if(!result)return;
    const blob=new Blob([result.content],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=result.filename;anchor.click();URL.revokeObjectURL(url);
  }
  return <section className="connected-grc connected-explorer">
    <header className="cg-heading">
      <div><small>CONNECTED GRC</small><h2>{tr?"Bağlantılı GRC Haritası":"Connected GRC Map"}</h2><p>{tr?"Bir kayıt seçin; hangi kayıtlarla bağlantılı olduğunu görün.":"Choose a record to see what it connects to."}</p></div>
      <div className="cg-source-controls"><span className="cg-source-state" role="status" data-ready={sourceState.ready} data-total={sourceState.total} data-loading={sourceState.loading}>{sourceState.loading?(tr?"Bağlantılar yükleniyor…":"Loading connections…"):sourceState.ready<sourceState.total?(tr?"Bazı kaynaklar eksik veya erişilemiyor; görünüm kısmi olabilir.":"Some sources are unavailable or incomplete; this view may be partial."):(tr?"Kaynaklar güncel":"Sources loaded")}</span><button type="button" disabled={sourceState.loading} onClick={()=>setSourceReload(value=>value+1)}>{sourceState.loading?(tr?"Yükleniyor…":"Loading…"):sourceState.ready<sourceState.total?(tr?"Tekrar dene":"Try again"):(tr?"Yenile":"Refresh")}</button></div>
    </header>
    {!!activeSnapshot?.result.issues.length&&<details className="cg-source-issues"><summary>{tr?"Kaynak durumu":"Source status"} · {sourceState.ready}/{sourceState.total}</summary><ul>{activeSnapshot.result.issues.map(issue=><li key={issue.key}>{connectedSourceIssueText(issue,lang)}</li>)}</ul><p>{tr?"Eksik kaynaklar bağlantı ve güvence sonuçlarını etkileyebilir. Yeniden deneyebilir veya ilgili modüldeki erişiminizi kontrol edebilirsiniz.":"Missing sources can affect connections and assurance results. Retry or check your access in the affected module."}</p></details>}
    <div className="cg-summary" aria-label={tr?"Genel durum":"Overview"}>
      <span><b>{records.length}</b> {tr?"kayıt":"records"}</span>
      <span><b>{links.length}</b> {tr?"bağlantı":"connections"}</span>
      <span><b>{records.length-linkedIds.size}</b> {tr?"bağlantısız kayıt":"unlinked records"}</span>
    </div>
    <div className="cg-tabs" role="group" aria-label={tr?"Harita görünümü":"Map view"}>
      {([['explore',tr?'Bağlantılar':'Connections'],['gaps',tr?'Eksikler':'Gaps'],['assurance',tr?'Güvence':'Assurance']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}{id==='gaps'&&<span>{coverage.gaps.length+unresolved.length}</span>}</button>)}
    </div>
    {view==="explore"&&<section className="cg-explore" aria-label={tr?"Bağlantıları keşfet":"Explore connections"}>
      <div className="cg-filters">
        <label>{tr?"Kayıt ara":"Find a record"}<input value={query} onChange={event=>{setQuery(event.target.value);setPage(0);setLinkLimit(8)}} placeholder={tr?"Ad veya kod…":"Name or code…"}/></label>
        <label>{tr?"Modül":"Module"}<select value={module} onChange={event=>{setModule(event.target.value);setPage(0);setLinkLimit(8)}}><option value="all">{tr?"Tüm modüller":"All modules"}</option>{modules.map(name=><option key={name} value={name}>{moduleLabel(name)}</option>)}</select></label>
        {(query||module!=="all")&&<button type="button" onClick={resetFilters}>{tr?"Temizle":"Clear"}</button>}
        <button type="button" className="cg-export" disabled={sourceState.loading} onClick={()=>download()}>{sourcesComplete?(tr?"Bağlantıları indir · CSV":"Export connections · CSV"):(tr?"Kısmi bağlantıları indir · CSV":"Export partial connections · CSV")}</button>
      </div>
      <div className="cg-workspace">
        <section ref={recordList} className="cg-records" aria-label={tr?"Kayıt seçimi":"Record selection"}>
          <header><b>{tr?"1. Kayıt seç":"1. Choose a record"}</b><span>{matchingRecords.length}</span></header>
          {visibleRecords.map(row=><button type="button" key={row.id} aria-pressed={selected?.id===row.id} onClick={()=>selectRecord(row.id)}><small>{row.code||row.id} · {moduleLabel(row.module)}</small><b>{connectedTitle(row)}</b></button>)}
          {!visibleRecords.length&&<p className="cg-empty">{tr?"Eşleşen kayıt yok. Aramayı veya modül filtresini değiştirin.":"No matching records. Change your search or module filter."}</p>}
          {matchingRecords.length>10&&<footer><button type="button" disabled={currentPage===0} onClick={()=>{setPage(currentPage-1);setLinkLimit(8)}}>{tr?"Önceki":"Previous"}</button><span>{currentPage+1} / {Math.ceil(matchingRecords.length/10)}</span><button type="button" disabled={(currentPage+1)*10>=matchingRecords.length} onClick={()=>{setPage(currentPage+1);setLinkLimit(8)}}>{tr?"Sonraki":"Next"}</button></footer>}
        </section>
        <section className="cg-detail" aria-label={tr?"Seçili kaydın bağlantıları":"Selected record connections"}>
          <header><small>{tr?"2. Bağlantıları incele":"2. Explore its connections"}</small>{selected?<><h3>{connectedTitle(selected)}</h3><p>{selected.code||selected.id} · {moduleLabel(selected.module)}</p><button type="button" onClick={()=>openRecord(selected)}>{tr?"Kaydı aç":"Open record"} ↗</button></>:<h3>{tr?"Bir kayıt seçin":"Choose a record"}</h3>}</header>
          {selected&&<><div className="cg-connection-count">{selectedLinks.length} {tr?"doğrudan bağlantı":"direct connections"}</div>
          <div className="cg-connections">{selectedLinks.slice(0,linkLimit).map((link,index)=>{
            const outgoing=link.source.id===selected.id,other=outgoing?link.target:link.source;
            return <article key={`${other.id}-${link.relation}-${index}`}><div><small>{outgoing?(tr?"Bu kayıttan →":"From this record →"):(tr?"Bu kayda ←":"To this record ←")} {connectedRelationLabels[link.relation]?.[lang]||link.relation}</small><button type="button" className="cg-follow" onClick={()=>followConnection(other)} aria-label={`${tr?'Bağlantılarını göster':'Explore connections'}: ${connectedTitle(other)}`}>{connectedTitle(other)}</button><span>{other.code||other.id} · {moduleLabel(other.module)}</span></div><button type="button" onClick={()=>openRecord(other)} aria-label={`${tr?'Kaydı aç':'Open record'}: ${connectedTitle(other)}`}>{tr?"Aç":"Open"} ↗</button></article>;
          })}</div>
          {!selectedLinks.length&&<p className="cg-empty">{tr?"Bu kaydın henüz bağlantısı yok. Kaydı açarak ilgili varlık, risk veya kontrol referanslarını ekleyebilirsiniz.":"This record has no connections yet. Open it to add the relevant asset, risk or control references."}</p>}
          {selectedLinks.length>linkLimit&&<button type="button" className="cg-more" onClick={()=>setLinkLimit(linkLimit+8)}>{tr?"Daha fazla bağlantı göster":"Show more connections"} ({selectedLinks.length-linkLimit})</button>}
          </>}
        </section>
      </div>
    </section>}
    {view==="gaps"&&<section className="connected-assurance cg-gaps">
      <header><div><h3>{tr?"Tamamlanması gereken bağlantılar":"Connections to complete"}</h3><p>{tr?"Eksik ilişkiyi inceleyin ve ilgili kaydı açarak tamamlayın.":"Review the missing relationship, then open the record to complete it."}</p></div><span>{sourcesComplete&&coverage.eligible?`${coverage.percent}%`:'—'} {tr?"tamlık":"complete"}</span></header>
      {!sourcesComplete&&<p className="cg-assessment-pending" role="status">{coverageNotice}</p>}
      <div className="cg-filters cg-gap-filters">
        <label>{tr?"Eksik bağlantı ara":"Find a gap"}<input value={gapQuery} onChange={event=>{setGapQuery(event.target.value);resetGapLimits()}} placeholder={tr?"Kayıt, kod veya referans…":"Record, code or reference…"}/></label>
        <label>{tr?"Kaynak modül":"Source module"}<select value={gapModule} onChange={event=>{setGapModule(event.target.value);resetGapLimits()}}><option value="all">{tr?"Tüm modüller":"All modules"}</option>{modules.map(name=><option key={name} value={name}>{moduleLabel(name)}</option>)}</select></label>
        <label>{tr?"Sorun türü":"Issue type"}<select value={gapType} onChange={event=>{setGapType(event.target.value as ConnectedGapType);resetGapLimits()}}>{([['all',tr?'Tüm sorunlar':'All issues'],['high',tr?'Yüksek öncelikli bağlantı eksiği':'High priority connection gaps'],['medium',tr?'Orta öncelikli bağlantı eksiği':'Medium priority connection gaps'],['missing',tr?'Hedef bulunamadı':'Target not found'],['ambiguous',tr?'Birden fazla hedef':'Multiple matching targets']] as const).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" className="cg-export" disabled={sourceState.loading} onClick={()=>download(true)}>{sourcesComplete?(tr?"Eksikleri indir · CSV":"Export gaps · CSV"):(tr?"Kısmi eksikleri indir · CSV":"Export partial gaps · CSV")}</button>
        {gapFiltersActive&&<button type="button" onClick={()=>{setGapQuery("");setGapModule("all");setGapType("all");resetGapLimits()}}>{tr?"Temizle":"Clear"}</button>}
      </div>
      <p className="cg-gap-results" role="status">{gapResults.gaps.length} / {coverage.gaps.length} {tr?"bağlantı eksiği":"connection gaps"} · {gapResults.unresolved.length} / {unresolved.length} {tr?"çözümlenmemiş referans":"unresolved references"}</p>
      {gapFiltersActive&&!gapResults.gaps.length&&!gapResults.unresolved.length&&<p className="cg-empty">{tr?"Filtrelerle eşleşen eksik yok. Diğer kayıtlar için filtreleri temizleyin.":"No gaps match these filters. Clear the filters to see other records."}</p>}
      {gapResults.gaps.length?<div className="connected-gap-list">{gapResults.gaps.slice(0,gapLimit).map((gap)=>{
        const target=connectedRemediationModule[gap.missingRelations[0]]||gap.row.module,focusable=Boolean(connectedGrcNavigation(gap.row));
        return <article key={`${gap.row.module}-${gap.row.id}-${gap.rule}`}><div className="connected-gap-score"><strong>{gap.percent}%</strong><small>{tr?"tamlık":"complete"}</small></div><div><span className={gap.severity}>{gap.severity==="high"?(tr?"Yüksek":"High"):(tr?"Orta":"Medium")}</span><b>{gap.row.code||gap.row.id}</b><em>{connectedTitle(gap.row)}</em><small>{tr?"Eksik: ":"Missing: "}{gap.missingRelations.map(relation=>connectedRelationLabels[relation]?.[lang]||relation).join(" · ")}</small></div><button type="button" onClick={()=>focusable?openRecord(gap.row):go(target)}>{focusable?(tr?"Kaydı düzelt":"Fix record"):(tr?"Bağlantıyı tamamla":"Complete link")}<span>→</span></button></article>;
      })}</div>:gapFiltersActive?null:<div className={sourcesComplete?"connected-assurance-ok":"cg-assessment-pending"}>{sourcesComplete?(tr?"Yüklenen kayıtlarda eksik zorunlu bağlantı bulunamadı.":"No missing required connections were found in the loaded records."):(tr?"Eksik bağlantı değerlendirmesi henüz doğrulanamadı.":"The missing-connection assessment is not yet verified.")}</div>}
      {gapResults.gaps.length>gapLimit&&<button type="button" className="cg-more" onClick={()=>setGapLimit(gapLimit+12)}>{tr?"Daha fazla göster":"Show more"} ({gapResults.gaps.length-gapLimit})</button>}
      {!!gapResults.unresolved.length&&<details className="connected-unresolved"><summary>{tr?`${gapResults.unresolved.length} çözümlenmemiş referans`:`${gapResults.unresolved.length} unresolved references`}</summary>{gapResults.unresolved.slice(0,referenceLimit).map((item,index)=><div key={`${item.source.id}-${item.field}-${index}`}><button type="button" onClick={()=>openRecord(item.source)}>{item.source.code||item.source.id}</button><span>{connectedRelationLabels[item.relation]?.[lang]||item.relation}</span><code>{item.value}</code><small className="connected-reference-reason">{item.reason === 'ambiguous' ? (tr ? `${item.candidates.length} olası kayıt — kaynak kayıtta ID veya benzersiz kod kullanın.` : `${item.candidates.length} possible records — use an ID or unique code in the source record.`) : (tr ? 'Hedef kayıt bulunamadı.' : 'Target record not found.')}</small>{item.reason === 'ambiguous' && <span className="connected-reference-candidates">{item.candidates.map(candidate => `${candidate.code || candidate.id} · ${connectedTitle(candidate)}`).join(' / ')}</span>}</div>)}{gapResults.unresolved.length>referenceLimit&&<button type="button" className="cg-more cg-more-references" onClick={()=>setReferenceLimit(referenceLimit+20)}>{tr?"Daha fazla referans göster":"Show more references"} ({gapResults.unresolved.length-referenceLimit})</button>}</details>}
    </section>}
    {view==="assurance"&&<section className="connected-assurance cg-operations">
      <header><div><h3>{tr?"Güvence işlemleri":"Assurance operations"}</h3><p>{tr?"Kontrol sonuçlarını, onayları ve takip işlerini yönetin.":"Manage control results, approvals and follow-up work."}</p></div></header>
      {!sourcesComplete&&<p className="cg-assessment-pending" role="status">{coverageNotice}</p>}
      {sourcesComplete&&assuranceSummary.rules>0&&<div className="connected-lifecycle-posture" aria-label={tr?"Sürekli güvence operasyonel duruşu":"Continuous assurance operational posture"}>
        <article className={assuranceSummary.averageAssuranceScore<70?"attention":"healthy"}><small>{tr?"Ortalama güvence":"Average assurance"}</small><strong>{assuranceSummary.averageAssuranceScore}%</strong><span>{assuranceSummary.rules} {tr?"sürekli kontrol":"continuous controls"}</span></article>
        <article className="healthy"><small>{tr?"Etkin":"Effective"}</small><strong>{assuranceSummary.effective}</strong><span>{tr?"doğrulanmış kontrol":"validated controls"}</span></article>
        <article className={assuranceSummary.degraded+assuranceSummary.ineffective?"attention":"healthy"}><small>{tr?"Bozulmuş / Etkisiz":"Degraded / Ineffective"}</small><strong>{assuranceSummary.degraded} / {assuranceSummary.ineffective}</strong><span>{tr?"aksiyon gerektiren":"requiring action"}</span></article>
        <article className={assuranceSummary.brokenChains?"critical":"healthy"}><small>{tr?"Kırık zincir":"Broken chains"}</small><strong>{assuranceSummary.brokenChains}</strong><span>{tr?"eksik yaşam döngüsü":"incomplete lifecycle"}</span></article>
        <article className={assuranceSummary.overdueRemediations?"critical":"healthy"}><small>{tr?"Geciken remediation":"Overdue remediation"}</small><strong>{assuranceSummary.overdueRemediations}</strong><span>{tr?"termin aşımı":"past due"}</span></article>
        <article className={assuranceSummary.riskLinked<assuranceSummary.rules?"attention":"healthy"}><small>{tr?"Riske bağlı":"Risk linked"}</small><strong>{assuranceSummary.riskLinked}/{assuranceSummary.rules}</strong><span>{tr?"güvence zinciri":"assurance chains"}</span></article>
      </div>}
      <ContinuousAssuranceWorkQueue lang={lang} onOpenAutomation={()=>go("Kanıt Otomasyonu")}/>
      <details className="module-analysis-disclosure">
        <summary><span><b>{tr?"Güvence yönetişimi ve eskalasyonlar":"Assurance governance and escalations"}</b><small>{tr?"Onaylar, yeniden test ve bildirim ayrıntıları":"Approvals, retests and notification details"}</small></span></summary>
        <ContinuousAssuranceGovernance lang={lang}/>
        <ContinuousAssuranceEscalationCenter lang={lang}/>
      </details>

    </section>}
  </section>;
}
