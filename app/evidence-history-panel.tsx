"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { EVIDENCE_FILE_ACCEPT, EVIDENCE_FILE_HELP } from "./evidence/file-types";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./evidence-history.css";

type Lang = "tr" | "en";
type Version = {
  id:string;evidenceId:string;versionNo:number;fileKey:string;fileName:string;fileType:string;fileSize:number;
  contentSha256:string;chainSha256:string;previousVersionId:string;evidenceTitle:string;owner:string;period:string;
  frameworks:string;controlRefs:string[];changeNote:string;createdBy:string;createdAt:string;legacy?:boolean;recordAvailable?:boolean;
};
type Overview = Awaited<ReturnType<typeof import('./evidence/history-overview').readEvidenceHistoryOverview>>;
type Detail = { evidenceId:string;loadRevision:number;versions:Version[];versionsComplete?:boolean;totalVersions?:number;integrity:{state:"verified"|"broken"|"legacy-unverified"|"unavailable";checked:number;failedVersion:number} };
const empty:Overview={evidenceItems:[],recentVersions:[],evidenceItemsComplete:true,recentVersionsComplete:true,summary:{evidenceRecords:0,trackedEvidence:0,legacyEvidence:0,totalVersions:0,linkedControls:0,verifiedChains:0,brokenChains:0,uncheckedChains:0,integrityScanComplete:true,retainedEvidence:0,retainedVersions:0}};

function formatDate(value:string,lang:Lang){const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(lang==="tr"?"tr-TR":"en-GB",{dateStyle:"short",timeStyle:"short"}).format(date)}
function shortHash(value:string){return value?`${value.slice(0,10)}…${value.slice(-6)}`:"—"}
function openEvidenceRecord(id:string){const ref=id.trim();if(!ref)return;navigateToFornost({module:"Kanıtlar",ref,source:"evidence-history",filter:{evidenceRef:ref}})}
function openControlRecord(controlRef:string){const ref=controlRef.trim();if(!ref)return;navigateToFornost({module:"Kontroller",ref,source:"evidence-history",filter:{controlRef:ref}})}

export default function EvidenceHistoryPanel({lang,currentUser}:{lang:Lang;currentUser?:{role:string}}){
  const tr=lang==="tr",canWrite=currentUser?.role==="Admin"||currentUser?.role==="Editor";
  const [overview,setOverview]=useState<Overview>(empty);
  const [timeline,setTimeline]=useState<Version[]|null>(null);
  const [timelineComplete,setTimelineComplete]=useState(true);
  const [selected,setSelected]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);
  const [detailRevision,setDetailRevision]=useState(0);
  const [controlRef,setControlRef]=useState("");
  const [versionRefs,setVersionRefs]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const uploading=useRef(false);

  async function loadOverview(){
    setLoading(true);
    try{
      const response=await fetch(withBasePath("/api/evidence/history"),{cache:"no-store"});
      const body=await response.json().catch(()=>({})) as Overview&{error?:string};
      if(!response.ok)throw new Error(body.error||(tr?"Kanıt geçmişi alınamadı.":"Unable to load evidence history."));
      setOverview(body);setTimeline(null);
      const current=body.evidenceItems.find(item=>item.id===selected);
      if(!current){
        const first=body.evidenceItems[0];
        if(first){setSelected(first.id);setVersionRefs(first.controlRefs.join(", "))}
        else{setSelected("");setVersionRefs("");setDetail(null)}
      }
      setDetailRevision(value=>value+1);
    }catch(error){setMessage(error instanceof Error?error.message:(tr?"Kanıt geçmişi alınamadı.":"Unable to load evidence history."))}
    finally{setLoading(false)}
  }

  useEffect(()=>{
    let live=true;const controller=new AbortController();
    fetch(withBasePath("/api/evidence/history"),{cache:"no-store",signal:controller.signal})
      .then(async response=>{const body=await response.json().catch(()=>({})) as Overview&{error?:string};if(!response.ok)throw new Error(body.error||(tr?"Kanıt geçmişi alınamadı.":"Unable to load evidence history."));return body})
      .then(body=>{if(!live)return;setOverview(body);if(body.evidenceItems[0]){setSelected(body.evidenceItems[0].id);setVersionRefs(body.evidenceItems[0].controlRefs.join(", "))}})
      .catch(error=>{if(live&&!controller.signal.aborted)setMessage(error instanceof Error?error.message:(tr?"Kanıt geçmişi alınamadı.":"Unable to load evidence history."))})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false;controller.abort()};
  },[tr]);

  useEffect(()=>{
    if(!selected){return}
    let live=true;const controller=new AbortController();
    fetch(withBasePath(`/api/evidence/history?id=${encodeURIComponent(selected)}`),{cache:"no-store",signal:controller.signal})
      .then(async response=>{const body=await response.json().catch(()=>({})) as Detail&{error?:string};if(!response.ok)throw new Error(body.error||(tr?"Kanıt zinciri alınamadı.":"Unable to load evidence chain."));return body})
      .then(body=>{if(live)setDetail({...body,evidenceId:selected,loadRevision:detailRevision})})
      .catch(()=>{if(live&&!controller.signal.aborted)setDetail({evidenceId:selected,loadRevision:detailRevision,versions:[],integrity:{state:"unavailable",checked:0,failedVersion:0}})});
    return()=>{live=false;controller.abort()};
  },[selected,tr,detailRevision]);

  async function searchControl(event:FormEvent){
    event.preventDefault();const query=controlRef.trim();
    if(!query){setTimeline(null);return}
    setLoading(true);setMessage("");
    try{
      const response=await fetch(withBasePath(`/api/evidence/history?controlRef=${encodeURIComponent(query)}`),{cache:"no-store"});
      const body=await response.json().catch(()=>({})) as {timeline?:Version[];complete?:boolean;error?:string};
      if(!response.ok)throw new Error(body.error||(tr?"Kontrol zaman çizelgesi alınamadı.":"Unable to load control timeline."));
      setTimeline(body.timeline||[]);setTimelineComplete(body.complete!==false);
    }catch(error){setMessage(error instanceof Error?error.message:(tr?"Kontrol zaman çizelgesi alınamadı.":"Unable to load control timeline."))}
    finally{setLoading(false)}
  }

  async function appendVersion(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected||uploading.current)return;
    uploading.current=true;
    const formElement=event.currentTarget;
    const form=new FormData(formElement);form.set("evidenceId",selected);form.set("controlRefs",versionRefs);
    setBusy(true);setMessage("");
    try{
      const response=await fetch(withBasePath("/api/evidence/history"),{method:"POST",body:form});
      const body=await response.json().catch(()=>({})) as {message?:string;error?:string};
      if(!response.ok)throw new Error(body.error||(tr?"Yeni kanıt versiyonu kaydedilemedi.":"Unable to save evidence version."));
      setMessage(body.message||(tr?"Yeni kanıt versiyonu kaydedildi.":"Evidence version saved."));
      formElement.reset();await loadOverview();
    }catch(error){setMessage(error instanceof Error?error.message:(tr?"Yeni kanıt versiyonu kaydedilemedi.":"Unable to save evidence version."))}
    finally{uploading.current=false;setBusy(false)}
  }

  const versions:Version[]=timeline??overview.recentVersions;
  const selectedDetail=detail?.evidenceId===selected&&detail.loadRevision===detailRevision?detail:null;
  const integrity=selectedDetail?.integrity?.state||"unknown";

  return <section className="eh-panel" aria-label={tr?"Kanıt geçmişi ve bütünlük zinciri":"Evidence history and integrity chain"}>
    <header className="eh-head">
      <div><small>EVIDENCE CHAIN · VERSION HISTORY</small><h3>{tr?"Kanıt Geçmişi ve Kontrol Zaman Çizelgesi":"Evidence History & Control Timeline"}</h3><p>{tr?"Her yeni dosyayı SHA-256 ile zincirler, önceki versiyonla ilişkilendirir ve kontrol bazında denetlenebilir kanıt geçmişi üretir.":"Chains every new file with SHA-256, links it to the prior version and builds an auditable control-level evidence history."}</p></div>
      <button type="button" onClick={()=>void loadOverview()} disabled={loading}>{loading?"…":"↻"} {tr?"Yenile":"Refresh"}</button>
    </header>
    {message&&<div className="eh-message" role="status"><span>{message}</span><button type="button" onClick={()=>setMessage("")}>×</button></div>}
    <div className="eh-metrics">
      <Metric value={overview.summary.trackedEvidence} suffix={`/${overview.summary.evidenceRecords}`} label={tr?"Versiyonlanan kanıt":"Versioned evidence"}/>
      <Metric value={overview.summary.totalVersions} label={tr?"Aktif kayıt sürümleri":"Active record versions"}/>
      <Metric value={overview.summary.linkedControls} label={tr?"Bağlı kontrol":"Linked controls"}/>
      <Metric value={overview.summary.verifiedChains} label={tr?"Doğrulanmış zincir":"Verified chains"}/>
      <Metric value={overview.summary.legacyEvidence} label={tr?"Legacy kanıt":"Legacy evidence"} warning={overview.summary.legacyEvidence>0}/>
      <Metric value={overview.summary.uncheckedChains} label={tr?"Taranamayan zincir":"Unchecked chains"} warning={overview.summary.uncheckedChains>0}/>
      <Metric value={overview.summary.brokenChains} label={tr?"Bütünlük hatası":"Integrity failures"} danger={overview.summary.brokenChains>0}/>
    </div>
    <p className="eh-scope">{tr?"Sayaçlar mevcut kanıt kayıtlarını kapsar. Zincir doğrulaması kayıt geçmişini denetler; dosya içeriğinin yeterliliğine karar vermez.":"Counters cover current evidence records. Chain verification checks recorded history; it does not decide whether file contents are adequate."}</p>
    {overview.summary.retainedVersions>0&&<p className="eh-retained">{tr?`${overview.summary.retainedEvidence} silinmiş kayda ait ${overview.summary.retainedVersions} sürüm geçmişte saklanıyor; aktif kayıt sayaçlarına dahil değil.`:`${overview.summary.retainedVersions} versions from ${overview.summary.retainedEvidence} removed records are retained in history and excluded from current-record counters.`}</p>}
    {overview.evidenceItemsComplete===false&&<p className="eh-warning" role="status">{tr?"Seçicide en son güncellenen 500 kayıt gösteriliyor. Sayaçlar tüm mevcut kayıtları kapsar.":"The selector shows the 500 most recently updated records. Counters include all current records."}</p>}
    {overview.summary.integrityScanComplete===false&&<p className="eh-warning" role="status">{tr?"Bütünlük taraması eksik; taranamayan zincirler doğrulanmış sayılmaz. En fazla 500 kaydın 2.000 sürümü incelenir.":"The integrity scan is incomplete; unchecked chains are not counted as verified. It scans up to 2,000 versions across 500 records."}</p>}
    <div className="eh-tools">
      <form className="eh-search" onSubmit={searchControl}><label>{tr?"Kontrol referansına göre drill-down":"Drill down by control reference"}<div><input value={controlRef} onChange={event=>setControlRef(event.target.value)} placeholder="A.5.15, CC6.1, PCI 8.4.2"/><button disabled={loading}>{tr?"Zaman çizelgesi":"Timeline"}</button>{controlRef.trim()&&<button type="button" className="ghost" onClick={()=>openControlRecord(controlRef)}>{tr?"Kontrolü Aç":"Open Control"}</button>}{timeline&&<button type="button" className="ghost" onClick={()=>{setTimeline(null);setControlRef("")}}>{tr?"Temizle":"Clear"}</button>}</div></label></form>
      <div className={`eh-integrity ${integrity}`}><small>{tr?"SEÇİLİ KANIT ZİNCİRİ":"SELECTED EVIDENCE CHAIN"}</small><b>{integrity==="verified"?(tr?"SHA-256 zinciri doğrulandı":"SHA-256 chain verified"):integrity==="broken"?(tr?"Bütünlük doğrulaması başarısız":"Integrity verification failed"):integrity==="legacy-unverified"?(tr?"Legacy · zincirlenmemiş":"Legacy · not chained"):integrity==="unavailable"?(tr?"Doğrulama tamamlanamadı":"Verification unavailable"):!selected?(tr?"Kanıt seçilmedi":"No evidence selected"):(tr?"Kontrol ediliyor":"Checking")}</b><span>{selectedDetail?.totalVersions??selectedDetail?.versions?.length??0} {tr?"versiyon":"versions"}</span></div>
    </div>
    {selectedDetail?.versionsComplete===false&&<p className="eh-warning" role="status">{tr?"Bu zincir 500 sürümlük okuma sınırını aşıyor. Tam geçmiş olmadan bütünlük sonucu verilemez.":"This chain exceeds the 500-version read limit. Integrity cannot be determined without the complete history."}</p>}
    {canWrite&&<form className="eh-version-form" onSubmit={appendVersion}>
      <div><small>{tr?"YENİ VERSİYON":"NEW VERSION"}</small><b>{tr?"Mevcut kanıta yeni dosya ekle":"Append a new file to existing evidence"}</b></div>
      <label>{tr?"Kanıt kaydı":"Evidence record"}<select disabled={busy} value={selected} onChange={event=>{const id=event.target.value;setSelected(id);setVersionRefs(overview.evidenceItems.find(item=>item.id===id)?.controlRefs.join(", ")||"")}} required><option value="">—</option>{overview.evidenceItems.map(item=><option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
      <label>{tr?"Kontrol referansları":"Control references"}<input disabled={busy} value={versionRefs} onChange={event=>setVersionRefs(event.target.value)} placeholder="A.5.15, CC6.1" required/></label>
      <label>{tr?"Dosya":"File"}<input disabled={busy} aria-label={tr?"Dosya":"File"} name="file" type="file" accept={EVIDENCE_FILE_ACCEPT} required/><small>{EVIDENCE_FILE_HELP[lang]}</small></label>
      <label className="note">{tr?"Değişiklik notu":"Change note"}<input disabled={busy} name="changeNote" minLength={5} maxLength={1000} placeholder={tr?"Örn. 2026 Q3 erişim gözden geçirme çıktısı":"e.g. 2026 Q3 access review export"} required/></label>
      <p className="note">{tr?"Yeni sürüm inceleme bekler; önceki dosyanın onayını devralmaz. Kabul edilmiş denetim talepleri kendi sabit sürümünü korur.":"A new version awaits review and does not inherit the previous file’s approval. Accepted audit requests keep their pinned version."}</p>
      <button className="primary" disabled={busy||!selected}>{busy?"…":(tr?"Yeni Versiyonu Kaydet":"Save New Version")}</button>
    </form>}
    <div className="eh-list-head"><div><small>{timeline?(tr?"KONTROL ZAMAN ÇİZELGESİ":"CONTROL TIMELINE"):(tr?"SON VERSİYON HAREKETLERİ":"RECENT VERSION ACTIVITY")}</small><h4>{timeline?`${controlRef} · ${versions.length}`:(tr?"Kanıt versiyonları":"Evidence versions")}</h4></div></div>
    {(timeline?!timelineComplete:overview.recentVersionsComplete===false)&&<p className="eh-warning" role="status">{timeline?(tr?"En son 300 eşleşen sürüm gösteriliyor; zaman çizelgesi eksik.":"Showing the latest 300 matching versions; the timeline is incomplete."):(tr?"En son 100 sürüm hareketi gösteriliyor.":"Showing the latest 100 version events.")}</p>}
    <div className="eh-list">{versions.length?versions.map(version=><article key={version.id} className={version.legacy?"legacy":""}>
      <div className="eh-version"><b>{version.versionNo?`v${version.versionNo}`:"—"}</b><span>{version.evidenceId}</span></div>
      <div className="eh-copy"><div><strong>{version.evidenceTitle}</strong><span>{version.controlRefs.join(" · ")||"—"}</span></div><p>{version.changeNote||"—"}</p><small>{version.fileName} · {version.createdBy} · {formatDate(version.createdAt,lang)}</small></div>
      <div className="eh-hashes"><span><small>CONTENT SHA-256</small><code title={version.contentSha256}>{shortHash(version.contentSha256)}</code></span><span><small>CHAIN SHA-256</small><code title={version.chainSha256}>{shortHash(version.chainSha256)}</code></span></div>
      <div className="eh-row-actions"><button type="button" disabled={version.recordAvailable===false} onClick={()=>openEvidenceRecord(version.evidenceId)}>{version.recordAvailable===false?(tr?"Kayıt silinmiş":"Record removed"):(tr?"Kanıtı Aç":"Open Evidence")}</button>{version.fileKey?<a href={withBasePath(`/api/evidence?key=${encodeURIComponent(version.fileKey)}`)}>{tr?"Dosyayı indir":"Download"}</a>:<span>—</span>}</div>
    </article>):<div className="eh-empty"><b>{tr?"Eşleşen kanıt versiyonu yok.":"No matching evidence versions."}</b><span>{tr?"Yeni yüklenen kanıtlar otomatik olarak versiyon zincirine alınır.":"New evidence uploads are automatically added to the version chain."}</span></div>}</div>
  </section>
}

function Metric({value,label,suffix="",danger=false,warning=false}:{value:number;label:string;suffix?:string;danger?:boolean;warning?:boolean}){return <div className={danger?"danger":warning?"warning":""}><strong>{value}<sup>{suffix}</sup></strong><span>{label}</span></div>}
