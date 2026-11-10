"use client";

import { useEffect, useState } from "react";
import type { CatalogSnapshot } from "./framework-catalog-notice";
import { auditClosureLabels } from "./audit-closure";
import { auditNameKey } from "./audit-readiness-portfolio";
import { auditRequirementDeadline, isClosedAuditRequirement, isOverdueAuditRequirement } from "./audit-overdue-requirements";
import AuditReadinessGate from "./audit-readiness-gate";
import { navigateToFornost } from "./navigation-focus";
import "./audit-portfolio-workspace.css";

export type AuditPortfolioItem = {
  closure_state?: "open" | "pending" | "closed";
  catalog?: CatalogSnapshot|null;
  id: string; name: string; template: string; audit_type: string; auditor: string; audit_owner: string; status: string;
  created_at?: string; updated_at?: string;
};
type Requirement = { id:string; module:string; code?:string; data:Record<string,unknown> };
type Props = {
  audits:AuditPortfolioItem[]; rows:Requirement[]; evidence:Requirement[]; lang:"tr"|"en"; showReadiness:boolean;
  activeId:string; onSelect:(id:string)=>void; onOpen:(name:string)=>void; onDelete?:(audit:AuditPortfolioItem)=>void;
  translate:(value:string)=>string;
};

function priority(data:Record<string,unknown>, now:number) {
  if (isOverdueAuditRequirement(data,now)) return 0;
  if (["kanıt bekleniyor","awaiting evidence","evidence requested"].includes(auditNameKey(data.evidenceStatus))) return 1;
  return 2;
}

export default function AuditPortfolioWorkspace({audits,rows,evidence,lang,showReadiness,activeId,onSelect,onOpen,onDelete,translate}:Props) {
  const tr=lang==="tr";
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),60000);
    return ()=>window.clearInterval(timer);
  },[]);
  const [query,setQuery]=useState("");
  const byName=new Map<string,Requirement[]>();
  for (const row of rows) {
    const name=auditNameKey(row.data.auditName);
    if(!byName.has(name)) byName.set(name,[]);
    byName.get(name)!.push(row);
  }
  const visible=audits.filter(a=>a.name.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang)));
  const active=visible.find(a=>a.id===activeId)||visible[0];
  const activeKey=auditNameKey(active?.name);
  const unique=!!activeKey&&audits.filter(a=>auditNameKey(a.name)===activeKey).length===1;
  const items=unique?byName.get(activeKey)||[]:[];
  const closed=items.filter(r=>isClosedAuditRequirement(r.data.status)).length;
  const pending=items.filter(r=>!isClosedAuditRequirement(r.data.status));
  const ordered=pending.slice().sort((a,b)=>priority(a.data,now)-priority(b.data,now)
    || (auditRequirementDeadline(a.data)||"~").localeCompare(auditRequirementDeadline(b.data)||"~") || a.id.localeCompare(b.id));
  const deadline=pending.map(r=>auditRequirementDeadline(r.data)).filter(Boolean).sort()[0];
  function open(audit:AuditPortfolioItem) { onSelect(audit.id); onOpen(audit.name); }
  function auditState(audit:AuditPortfolioItem) {
    if(audit.closure_state && audit.closure_state!=="open") return auditClosureLabels[audit.closure_state][tr?0:1];
    return byName.has(auditNameKey(audit.name))?(tr?"Aktif":"Active"):(tr?"Taslak":"Draft");
  }
  return <section className="audit-portfolio apw" aria-label={tr?"Denetim seçimi":"Audit selection"}>
    <div className="apw-index">
      <div className="apw-index-heading"><h3>{tr?"Denetimler":"Audits"}</h3><span>{audits.length}</span></div>
      {audits.length>0&&<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr?"Denetim ara…":"Search audits…"} aria-label={tr?"Denetim ara":"Search audits"}/>}
      <div className="apw-entries">{visible.map(a=><div className="apw-entry" key={a.id} data-active={a.id===active?.id}>
        <button className="apw-select" type="button" aria-pressed={a.id===active?.id} onClick={()=>onSelect(a.id)}>
          <i aria-hidden="true">{a.id===active?.id?"✓":""}</i><span><b>{a.name}</b><small>{auditState(a)}</small></span>
        </button>
        <button type="button" className="audit-card-open apw-shortcut" onClick={()=>open(a)} title={(tr?"Denetimi aç":"Open audit")+" · "+a.name}>
          <span className="apw-sr">{(tr?"Denetimi aç":"Open audit")+" · "+a.name}</span><span aria-hidden="true">↗</span>
        </button>
      </div>)}</div>
      {!visible.length&&<p role="status">{audits.length?(tr?"Aramanızla eşleşen denetim yok.":"No audits match your search."):(tr?"Henüz denetim oluşturulmadı.":"No audits have been created.")}</p>}
    </div>
    {active?<article className="apw-inspector" data-audit-id={active.id}><header className="apw-head">
      <div><h3>{active.name}</h3><div className="apw-meta">
        <span>{tr?"Sorumlu":"Owner"} · {active.audit_owner||(tr?"Atanmadı":"Unassigned")}</span>
        {deadline&&<span>{tr?"İlk açık madde termini":"Earliest open due date"} · <time dateTime={deadline}>{Number.isFinite(Date.parse(deadline))?new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(deadline)):deadline}</time></span>}
      </div></div><button type="button" className="primary" onClick={()=>open(active)}>{tr?"Denetimi aç":"Open audit"} →</button>
    </header>
    {unique?<><h4>{tr?"Seçili denetimin durumu":"Selected audit status"}</h4>
      <div className="apw-metrics"><section className="apw-metric">
        <h5>{tr?"Madde kapanışı":"Requirement closure"}</h5>
        {items.length?<><b>{closed} / {items.length} <span>{tr?"madde kapalı":"requirements closed"}</span></b><div className="apw-track" aria-hidden="true"><i style={{width:closed/items.length*100+"%"}}/></div></>:<p>{tr?"Henüz madde eklenmedi.":"No requirements yet."}</p>}
      </section>
      {showReadiness&&<AuditReadinessGate key={active.id} mode="metric" lang={lang} auditName={active.name} records={[...items,...evidence]}/>}
      </div>
      <h4>{tr?"Öncelikli maddeler":"Priority requirements"}</h4>
      {ordered.length?<div className="apw-table"><table><thead><tr>{(tr?["Madde","Sorumlu","Durum"]:["Requirement","Owner","Status"]).map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
        {ordered.slice(0,4).map(row=>{const rank=priority(row.data,now);
          return <tr key={row.id}><th scope="row"><button type="button" className="apw-link" onClick={()=>navigateToFornost({module:"Denetim Yönetimi",kind:"record",ref:row.id,source:"audit-portfolio"})}>{String(row.data.requirementTitle||row.data.title||row.data.requirementRef||row.code||row.id)}</button></th>
            <td>{String(row.data.owner||row.data.auditOwner||(tr?"Atanmadı":"Unassigned"))}</td>
            <td><span className="apw-status" data-rank={rank}>{rank===0?(tr?"Gecikti":"Overdue"):rank===1?(tr?"Kanıt bekliyor":"Awaiting evidence"):translate(String(row.data.status||(tr?"Açık":"Open")))}</span></td></tr>;
        })}
      </tbody></table></div>:<p>{tr?"Takip edilecek açık madde yok.":"No open requirements to follow up."}</p>}
    </>:<p role="alert">{tr?"Denetim adı benzersiz olmadığı için kapsam doğrulanamadı.":"The audit name is ambiguous. Its scope could not be verified."}</p>}
    {onDelete&&<details className="apw-management"><summary>{tr?"Denetim işlemleri":"Audit actions"}</summary>
      <button type="button" className="ghost" disabled={active.closure_state==="closed"} onClick={()=>onDelete(active)}>{tr?"Denetimi Sil":"Delete Audit"}</button>
    </details>}</article>:<div className="apw-inspector apw-empty"><h3>{audits.length?(tr?"Denetim bulunamadı":"No matching audit"):(tr?"Portföy henüz boş":"The portfolio is empty")}</h3>
      <p>{audits.length?(tr?"Başka bir denetim adı arayın.":"Try a different audit name."):(tr?"Denetim oluşturulduğunda kapsamı, maddeleri ve kanıt hazırlığı burada görünür.":"Once an audit is created, its scope, requirements and evidence readiness appear here.")}</p></div>}
  </section>;
}
