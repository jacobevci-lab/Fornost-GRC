import {useEffect,useState} from "react";
import {useWorkflowRecords} from "../use-workflow-records";
import {workNames,type PolicyWorkPage,type PolicyWorkItem} from "./worklist";

export function PolicyWorklist({tr,role,emptyRegister,open,create,inventory}:{
  tr:boolean;role:string;emptyRegister:boolean;open:(row:PolicyWorkItem)=>void;create:()=>void;inventory:()=>void;
}){
  const [scope,setScope]=useState(role==="Viewer"?"mine":"org"),[text,setText]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(1),[expanded,expand]=useState("");
  useEffect(()=>{const t=setTimeout(()=>{setQuery(text.trim());setPage(1);expand("");},180);return()=>clearTimeout(t);},[text]);
  const activeScope=role==="Viewer"?"mine":scope;
  const path="/api/policy-lifecycle?"+new URLSearchParams({view:"worklist",scope:activeScope,q:query,page:String(page),lang:tr?"tr":"en"});
  const source=useWorkflowRecords<PolicyWorkPage>(path,null);
  const data=source.ready&&source.data&&Array.isArray(source.data.rows)?source.data:null;
  const busy=source.loading||text.trim()!==query;
  const today=new Date().toISOString().slice(0,10);
  function date(row:PolicyWorkItem){
    if(!row.due)return "—";
    const stamp=Date.parse(row.due+"T00:00:00Z");if(!Number.isFinite(stamp))return row.due;
    const value=new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(stamp);
    if(row.due>=today)return value;
    const days=Math.round((Date.parse(today+"T00:00:00Z")-stamp)/86400000);
    return value+" · "+(tr?days+" gün geçti":days+"d past");
  }
  function scopeTo(value:string){setScope(value);setPage(1);expand("");}
  const action=(row:PolicyWorkItem)=>row.kind==="response"?(tr?"Oku ve yanıtla":"Read and respond"):["draft","review","approved"].includes(row.kind)?(tr?"Sürümü incele":"Inspect version"):(tr?"Kaydı aç":"Open record");
  return <section className="pwl" aria-label={tr?"Politika iş listesi":"Policy worklist"} aria-busy={busy}>
    <div className="pwl-tools"><div className="pwl-scopes" role="group" aria-label={tr?"İş kapsamı":"Work scope"}>
      {role!=="Viewer"&&<button type="button" aria-pressed={activeScope==="org"} onClick={()=>scopeTo("org")}>{tr?"Kurum işleri":"Organization work"}</button>}
      <button type="button" aria-pressed={activeScope==="mine"} onClick={()=>scopeTo("mine")}>{tr?"Bana atananlar":"Assigned to me"}</button></div>
      <input type="search" aria-label={tr?"İş listesinde ara":"Search worklist"} placeholder={tr?"Politika, işlem veya sorumlu ara…":"Search policy, task or assignee…"} value={text} maxLength={200} onChange={e=>setText(e.target.value)}/></div>
    {busy?<p role="status">{tr?"İş listesi yükleniyor…":"Loading worklist…"}</p>:!data?<p role="alert">{tr?"İş listesi alınamadı.":"Worklist unavailable."} <button onClick={()=>void source.reload()}>{tr?"Yeniden dene":"Retry"}</button></p>:<>
      <div className="pwl-counts"><span>{activeScope==="mine"?(tr?"Atandığım açık kampanya":"My open campaigns"):(tr?"Açık kampanya":"Open campaigns")} <b>{data.openCampaigns}</b></span><span>{activeScope==="mine"?(tr?"Bekleyen beyanım":"My pending responses"):(tr?"Bekleyen çalışan beyanı":"Pending employee responses")} <b>{data.pendingResponses}</b></span></div>
      {data.rows.length?<div className="pwl-table"><table><thead><tr>{(tr?["Politika ve kayıt","Bekleyen işlem","Sorumlu","İlgili tarih"]:["Policy and record","Pending task","Responsible","Relevant date"]).map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead>
      {data.rows.map(row=>{
        const key=row.kind+":"+row.id,shown=expanded===key,exception=["expiry","exceptionReview","exceptionDraft"].includes(row.kind);
        return <tbody key={key}><tr><td><button className="pwl-row" aria-expanded={shown} onClick={()=>expand(shown?"":key)}><span aria-hidden="true" className="pwl-marker"/><span><b>{row.title}</b><small>{row.code}{row.versionNumber!=null?` · v${row.versionNumber}`:""}</small></span></button></td>
          <td data-label={tr?"İşlem":"Task"}>{workNames[row.kind][tr?0:1]}</td><td data-label={tr?"Sorumlu":"Responsible"}>{row.responsible}</td>
          <td data-label={tr?"Tarih":"Date"}><span className={row.due&&row.due<today?"pwl-late":""}>{date(row)}</span>{row.due&&<small>{exception?(tr?"İstisna bitişi":"Exception expiry"):row.kind==="periodic"?(tr?"İnceleme tarihi":"Review due"):(tr?"Yanıt son tarihi":"Response deadline")}</small>}</td></tr>
          {shown&&<tr className="pwl-detail"><td colSpan={4}><div><span>{row.detail||workNames[row.kind][tr?0:1]}</span><button onClick={()=>open(row)}>{action(row)}</button></div></td></tr>}</tbody>;
      })}</table></div>:<div className="pwl-empty"><h3>{emptyRegister&&role==="Viewer"?(tr?"Size atanmış politika yok":"No policies assigned to you"):emptyRegister?(tr?"Henüz politika yok":"No policies yet"):query?(tr?"Aramayla eşleşen iş yok":"No matching work"):activeScope==="mine"?(tr?"Size atanmış bekleyen iş yok":"No pending work assigned to you"):(tr?"Bekleyen yönetişim işi yok":"No pending governance work")}</h3>
        {emptyRegister&&role!=="Viewer"?<button onClick={create}>{tr?"İlk politikayı oluştur":"Create the first policy"}</button>:query?<button onClick={()=>setText("")}>{tr?"Aramayı temizle":"Clear search"}</button>:!emptyRegister&&<button onClick={inventory}>{tr?"Envanteri aç":"Open register"}</button>}</div>}
      {data.pages>1&&<nav className="pwl-pages" aria-label={tr?"İş listesi sayfaları":"Worklist pages"}><button disabled={data.page===1} onClick={()=>{expand("");setPage(data.page-1)}}>{tr?"Önceki":"Previous"}</button><span>{data.page} / {data.pages} · {data.total} {tr?"iş":"tasks"}</span><button disabled={data.page>=data.pages} onClick={()=>{expand("");setPage(data.page+1)}}>{tr?"Sonraki":"Next"}</button></nav>}
    </>}
  </section>;
}
