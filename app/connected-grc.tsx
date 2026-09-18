"use client";

import { useMemo, useState } from "react";

type Lang = "tr" | "en";
type GrcRow = { id:string; module:string; data:Record<string,unknown>; updatedAt?:string };
type Link = { source:GrcRow; target:GrcRow; matched:string };

const ignored = new Set(["Ana Sayfa","Bağlantılı GRC","Raporlar"]);
const titleOf = (row:GrcRow) => String(row.data.title || row.data.name || row.data.process || row.data.controlId || row.data.code || row.id);
const searchable = (row:GrcRow) => Object.values(row.data).filter(value => typeof value === "string" || typeof value === "number").join(" ").toLocaleLowerCase("tr-TR");
const tokens = (row:GrcRow) => [row.id,titleOf(row),row.data.code,row.data.controlId,row.data.reference]
  .map(value=>String(value||"").trim()).filter(value=>value.length>=4);
const csv = (value:unknown) => { const text=String(value??""); const safe=/^[=+\-@]/.test(text)?`'${text}`:text; return `"${safe.replace(/"/g,'""')}"`; };

export default function ConnectedGrc({rows,lang,go}:{rows:GrcRow[];lang:Lang;go:(module:string)=>void}){
  const tr=lang==="tr",[module,setModule]=useState("all"),[query,setQuery]=useState("");
  const records=useMemo(()=>rows.filter(row=>!ignored.has(row.module)),[rows]);
  const links=useMemo(()=>{
    const result:Link[]=[];
    for(const source of records){
      const haystack=searchable(source);
      for(const target of records){
        if(source.id===target.id||source.module===target.module)continue;
        const matched=tokens(target).find(token=>haystack.includes(token.toLocaleLowerCase("tr-TR")));
        if(matched)result.push({source,target,matched});
        if(result.length>=800)return result;
      }
    }
    return result;
  },[records]);
  const modules=useMemo(()=>Array.from(new Set(records.map(row=>row.module))).sort(),[records]);
  const linkedIds=new Set(links.flatMap(link=>[link.source.id,link.target.id]));
  const filtered=links.filter(link=>{
    const matchesModule=module==="all"||link.source.module===module||link.target.module===module;
    const needle=query.trim().toLocaleLowerCase(tr?"tr-TR":"en-US");
    return matchesModule&&(!needle||`${titleOf(link.source)} ${titleOf(link.target)} ${link.source.module} ${link.target.module}`.toLocaleLowerCase(tr?"tr-TR":"en-US").includes(needle));
  });
  const moduleStats=modules.map(name=>({name,count:records.filter(row=>row.module===name).length,links:links.filter(link=>link.source.module===name||link.target.module===name).length})).sort((a,b)=>b.links-a.links);
  function download(){
    const data=[["Source module","Source ID","Source title","Target module","Target ID","Target title","Matched reference"],...filtered.map(link=>[link.source.module,link.source.id,titleOf(link.source),link.target.module,link.target.id,titleOf(link.target),link.matched])];
    const blob=new Blob(["\uFEFF"+data.map(row=>row.map(csv).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="fornost-connected-grc.csv";anchor.click();URL.revokeObjectURL(url);
  }
  return <section className="connected-grc">
    <header className="connected-hero"><div><small>CONNECTED GRC · RELATIONSHIP INTELLIGENCE</small><h2>{tr?"Bağlantılı GRC Haritası":"Connected GRC Map"}</h2><p>{tr?"Risk, varlık, kontrol, kanıt, denetim ve süreç kayıtlarının birbirini nasıl etkilediğini tek görünümde izleyin.":"Trace how risks, assets, controls, evidence, audits and processes affect one another."}</p></div><button onClick={download}>{tr?"İlişki CSV":"Relationship CSV"}</button></header>
    <div className="connected-kpis"><article><b>{records.length}</b><span>{tr?"Toplam düğüm":"Total nodes"}</span></article><article><b>{links.length}</b><span>{tr?"Doğrulanmış bağlantı":"Verified links"}</span></article><article><b>{linkedIds.size}</b><span>{tr?"Bağlı kayıt":"Linked records"}</span></article><article><b>{records.length-linkedIds.size}</b><span>{tr?"Bağlantısız kayıt":"Orphan records"}</span></article></div>
    <div className="connected-layout">
      <aside><div><b>{tr?"Alan yoğunluğu":"Domain density"}</b><small>{tr?"Modülü filtrelemek için seçin":"Select a module to filter"}</small></div><button className={module==="all"?"active":""} onClick={()=>setModule("all")}><span>{tr?"Tüm alanlar":"All domains"}</span><em>{links.length}</em></button>{moduleStats.map(item=><button className={module===item.name?"active":""} key={item.name} onClick={()=>setModule(item.name)}><span>{item.name}<small>{item.count} {tr?"kayıt":"records"}</small></span><em>{item.links}</em></button>)}</aside>
      <div className="connected-register"><div className="connected-toolbar"><div><b>{tr?"İlişki sicili":"Relationship register"}</b><small>{filtered.length} / {links.length}</small></div><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr?"Kayıt veya modül ara…":"Search record or module…"}/></div><div className="connected-table"><div className="connected-table-head"><span>{tr?"Kaynak":"Source"}</span><span>{tr?"Bağlantı":"Relationship"}</span><span>{tr?"Hedef":"Target"}</span></div>{filtered.slice(0,150).map((link,index)=><article key={`${link.source.id}-${link.target.id}-${index}`}><button onClick={()=>go(link.source.module)}><small>{link.source.module}</small><b>{titleOf(link.source)}</b><em>{link.source.id}</em></button><div><i/><span>{tr?"referans verir":"references"}</span><code>{link.matched}</code></div><button onClick={()=>go(link.target.module)}><small>{link.target.module}</small><b>{titleOf(link.target)}</b><em>{link.target.id}</em></button></article>)}{!filtered.length&&<p>{tr?"Filtreyle eşleşen ilişki bulunamadı. Kayıtların referans alanlarını kontrol edin.":"No relationship matches this filter. Review record reference fields."}</p>}</div></div>
    </div>
  </section>;
}
