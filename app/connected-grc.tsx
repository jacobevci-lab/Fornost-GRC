"use client";

import { useEffect, useMemo, useState } from "react";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, connectedRelationLabels, connectedRemediationModule, connectedTitle, type ConnectedGrcRow } from "./connected-grc-model";
import { buildConnectedGrcEnterpriseRows, connectedGrcEnterpriseEndpoints, type ConnectedGrcEnterprisePayloads } from "./connected-grc-sources";
import { buildContinuousAssuranceChains, summarizeContinuousAssurance } from "./continuous-assurance-chain";
import { withBasePath } from "./base-path";
import "./connected-grc-contract.css";
import "./connected-assurance-posture.css";

type Lang = "tr" | "en";
const ignored = new Set(["Ana Sayfa","Bağlantılı GRC","Raporlar"]);
const csv = (value:unknown) => { const text=String(value??""); const safe=/^[=+\-@]/.test(text)?`'${text}`:text; return `"${safe.replace(/"/g,'""')}"`; };

export default function ConnectedGrc({rows,lang,go}:{rows:ConnectedGrcRow[];lang:Lang;go:(module:string)=>void}){
  const tr=lang==="tr",[module,setModule]=useState("all"),[query,setQuery]=useState("");
  const [enterpriseRows,setEnterpriseRows]=useState<ConnectedGrcRow[]>([]);
  const [sourceState,setSourceState]=useState({ready:0,total:connectedGrcEnterpriseEndpoints.length,loading:true});

  useEffect(()=>{
    const controller=new AbortController();
    let current=true;
    (async()=>{
      const payloads:ConnectedGrcEnterprisePayloads={};
      let ready=0;
      await Promise.all(connectedGrcEnterpriseEndpoints.map(async endpoint=>{
        try{
          const response=await fetch(withBasePath(endpoint.path),{signal:controller.signal,headers:{accept:"application/json"},cache:"no-store"});
          if(!response.ok)return;
          const body=await response.json();
          if(body&&typeof body==="object"&&!Array.isArray(body)){
            (payloads as Record<string,unknown>)[endpoint.key]=body;
            ready+=1;
          }
        }catch(error){
          if((error as {name?:string})?.name!=="AbortError") console.warn(`Connected GRC source unavailable: ${endpoint.path}`);
        }
      }));
      if(!current)return;
      setEnterpriseRows(buildConnectedGrcEnterpriseRows(payloads));
      setSourceState({ready,total:connectedGrcEnterpriseEndpoints.length,loading:false});
    })();
    return()=>{current=false;controller.abort();};
  },[]);

  const records=useMemo(()=>{
    const merged=new Map<string,ConnectedGrcRow>();
    for(const row of [...rows,...enterpriseRows]) if(!ignored.has(row.module)) merged.set(row.id,row);
    return Array.from(merged.values());
  },[rows,enterpriseRows]);
  const graph=useMemo(()=>buildConnectedGrcGraph(records),[records]),links=graph.links,unresolved=graph.unresolved;
  const coverage=useMemo(()=>assessConnectedGrcCoverage(records,links),[records,links]);
  const assuranceChains=useMemo(()=>buildContinuousAssuranceChains(records,links),[records,links]);
  const assuranceSummary=useMemo(()=>summarizeContinuousAssurance(assuranceChains),[assuranceChains]);
  const modules=useMemo(()=>Array.from(new Set(records.map(row=>row.module))).sort(),[records]);
  const linkedIds=new Set(links.flatMap(link=>[link.source.id,link.target.id]));
  const filtered=links.filter(link=>{
    const matchesModule=module==="all"||link.source.module===module||link.target.module===module;
    const needle=query.trim().toLocaleLowerCase(tr?"tr-TR":"en-US");
    return matchesModule&&(!needle||`${connectedTitle(link.source)} ${connectedTitle(link.target)} ${link.source.module} ${link.target.module} ${link.relation}`.toLocaleLowerCase(tr?"tr-TR":"en-US").includes(needle));
  });
  const moduleStats=modules.map(name=>({name,count:records.filter(row=>row.module===name).length,links:links.filter(link=>link.source.module===name||link.target.module===name).length})).sort((a,b)=>b.links-a.links);
  function download(){
    const data=[["Source module","Source code","Source title","Relationship","Field","Target module","Target code","Target title","Matched reference"],...filtered.map(link=>[link.source.module,link.source.code||link.source.id,connectedTitle(link.source),link.relation,link.field,link.target.module,link.target.code||link.target.id,connectedTitle(link.target),link.matched])];
    const blob=new Blob(["\uFEFF"+data.map(row=>row.map(csv).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="fornost-connected-grc.csv";anchor.click();URL.revokeObjectURL(url);
  }
  return <section className="connected-grc">
    <header className="connected-hero"><div><small>CONNECTED GRC · RELATIONSHIP INTELLIGENCE · {sourceState.loading?(tr?"CANLI KAYNAKLAR YÜKLENİYOR":"LOADING LIVE SOURCES"):`${sourceState.ready}/${sourceState.total} ${tr?"CANLI KAYNAK":"LIVE SOURCES"}`}</small><h2>{tr?"Bağlantılı GRC Haritası":"Connected GRC Map"}</h2><p>{tr?"Risk, varlık, kontrol, kanıt, denetim, bulgu, olay, politika, regülasyon ve tedarikçi kayıtlarının birbirini nasıl etkilediğini tek görünümde izleyin.":"Trace how risks, assets, controls, evidence, audits, findings, incidents, policies, regulations and vendors affect one another."}</p></div><button onClick={download}>{tr?"İlişki CSV":"Relationship CSV"}</button></header>
    <div className="connected-kpis"><article><b>{records.length}</b><span>{tr?"Toplam düğüm":"Total nodes"}</span></article><article><b>{links.length}</b><span>{tr?"Doğrulanmış bağlantı":"Verified links"}</span></article><article><b>{linkedIds.size}</b><span>{tr?"Bağlı kayıt":"Linked records"}</span></article><article><b>{records.length-linkedIds.size}</b><span>{tr?"Bağlantısız kayıt":"Orphan records"}</span></article><article className={unresolved.length?"attention":""}><b>{unresolved.length}</b><span>{tr?"Çözülmeyen referans":"Unresolved references"}</span></article><article className={coverage.gaps.length?"attention":""}><b>{coverage.percent}%</b><span>{tr?"Güvence izlenebilirliği":"Assurance traceability"}</span></article></div>
    <section className="connected-assurance" aria-label={tr?"İlişki güvence boşlukları":"Relationship assurance gaps"}>
      <header><div><small>{tr?"SÜREKLİ GÜVENCE":"CONTINUOUS ASSURANCE"}</small><h3>{tr?"Zincir bütünlüğü":"Chain integrity"}</h3></div><p>{tr?`${coverage.covered} tam, ${coverage.partial} kısmi · ${coverage.eligible} kritik kayıt için zorunlu ilişki grupları ölçülüyor.`:`${coverage.covered} complete, ${coverage.partial} partial · required relation groups measured across ${coverage.eligible} critical records.`}</p></header>
      {assuranceSummary.rules>0&&<div className="connected-lifecycle-posture" aria-label={tr?"Sürekli güvence operasyonel duruşu":"Continuous assurance operational posture"}>
        <article className={assuranceSummary.averageAssuranceScore<70?"attention":"healthy"}><small>{tr?"Ortalama güvence":"Average assurance"}</small><strong>{assuranceSummary.averageAssuranceScore}%</strong><span>{assuranceSummary.rules} {tr?"sürekli kontrol":"continuous controls"}</span></article>
        <article className="healthy"><small>{tr?"Etkin":"Effective"}</small><strong>{assuranceSummary.effective}</strong><span>{tr?"doğrulanmış kontrol":"validated controls"}</span></article>
        <article className={assuranceSummary.degraded+assuranceSummary.ineffective?"attention":"healthy"}><small>{tr?"Bozulmuş / Etkisiz":"Degraded / Ineffective"}</small><strong>{assuranceSummary.degraded} / {assuranceSummary.ineffective}</strong><span>{tr?"aksiyon gerektiren":"requiring action"}</span></article>
        <article className={assuranceSummary.brokenChains?"critical":"healthy"}><small>{tr?"Kırık zincir":"Broken chains"}</small><strong>{assuranceSummary.brokenChains}</strong><span>{tr?"eksik yaşam döngüsü":"incomplete lifecycle"}</span></article>
        <article className={assuranceSummary.overdueRemediations?"critical":"healthy"}><small>{tr?"Geciken remediation":"Overdue remediation"}</small><strong>{assuranceSummary.overdueRemediations}</strong><span>{tr?"termin aşımı":"past due"}</span></article>
        <article className={assuranceSummary.riskLinked<assuranceSummary.rules?"attention":"healthy"}><small>{tr?"Riske bağlı":"Risk linked"}</small><strong>{assuranceSummary.riskLinked}/{assuranceSummary.rules}</strong><span>{tr?"güvence zinciri":"assurance chains"}</span></article>
      </div>}
      <div className="connected-domain-posture">{coverage.domains.map(domain=><button type="button" key={domain.module} onClick={()=>setModule(domain.module)}><span><b>{domain.module}</b><small>{domain.covered} {tr?"tam":"complete"} · {domain.partial} {tr?"kısmi":"partial"}</small></span><strong className={domain.percent<50?"critical":domain.percent<100?"attention":"healthy"}>{domain.percent}%</strong><i><em style={{width:`${domain.percent}%`}}/></i></button>)}</div>
      {coverage.gaps.length?<div className="connected-gap-list">{coverage.gaps.slice(0,12).map((gap)=>{
        const target=connectedRemediationModule[gap.missingRelations[0]]||gap.row.module;
        return <article key={`${gap.row.module}-${gap.row.id}-${gap.rule}`}><div className="connected-gap-score"><strong>{gap.percent}%</strong><small>{tr?"tamlık":"complete"}</small></div><div><span className={gap.severity}>{gap.severity==="high"?(tr?"Yüksek":"High"):(tr?"Orta":"Medium")}</span><b>{gap.row.code||gap.row.id}</b><em>{connectedTitle(gap.row)}</em><small>{tr?"Eksik: ":"Missing: "}{gap.missingRelations.map(relation=>connectedRelationLabels[relation]?.[lang]||relation).join(" · ")}</small></div><button type="button" onClick={()=>go(target)}>{tr?"Bağlantıyı tamamla":"Complete link"}<span>→</span></button></article>;
      })}</div>:<div className="connected-assurance-ok">{tr?"Tüm zorunlu GRC bağlantıları tamamlandı.":"All required GRC relationships are complete."}</div>}
    </section>
    <div className="connected-layout">
      <aside><div><b>{tr?"Alan yoğunluğu":"Domain density"}</b><small>{tr?"Modülü filtrelemek için seçin":"Select a module to filter"}</small></div><button className={module==="all"?"active":""} onClick={()=>setModule("all")}><span>{tr?"Tüm alanlar":"All domains"}</span><em>{links.length}</em></button>{moduleStats.map(item=><button className={module===item.name?"active":""} key={item.name} onClick={()=>setModule(item.name)}><span>{item.name}<small>{item.count} {tr?"kayıt":"records"}</small></span><em>{item.links}</em></button>)}</aside>
      <div className="connected-register"><div className="connected-toolbar"><div><b>{tr?"İlişki sicili":"Relationship register"}</b><small>{filtered.length} / {links.length} · {tr?"alan-tabanlı + canlı modül verisi":"field-based + live module data"}</small></div><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr?"Kayıt, ilişki veya modül ara…":"Search record, relation or module…"}/></div><div className="connected-table"><div className="connected-table-head"><span>{tr?"Kaynak":"Source"}</span><span>{tr?"Bağlantı":"Relationship"}</span><span>{tr?"Hedef":"Target"}</span></div>{filtered.slice(0,200).map((link,index)=><article key={`${link.source.id}-${link.target.id}-${link.relation}-${index}`}><button onClick={()=>go(link.source.module)}><small>{link.source.module}</small><b>{connectedTitle(link.source)}</b><em>{link.source.code||link.source.id}</em></button><div><i/><span>{connectedRelationLabels[link.relation]?.[lang]||link.relation}</span><code>{link.field}: {link.matched}</code></div><button onClick={()=>go(link.target.module)}><small>{link.target.module}</small><b>{connectedTitle(link.target)}</b><em>{link.target.code||link.target.id}</em></button></article>)}{!filtered.length&&<p>{tr?"Filtreyle eşleşen ilişki bulunamadı. Kayıtların referans alanlarını kontrol edin.":"No relationship matches this filter. Review record reference fields."}</p>}</div>{!!unresolved.length&&<details className="connected-unresolved"><summary>{tr?`${unresolved.length} çözülmeyen referansı incele`:`Review ${unresolved.length} unresolved references`}</summary>{unresolved.slice(0,75).map((item,index)=><div key={`${item.source.id}-${item.field}-${index}`}><button onClick={()=>go(item.source.module)}>{item.source.code||item.source.id}</button><span>{item.field}</span><code>{item.value}</code></div>)}</details>}</div>
    </div>
  </section>;
}
