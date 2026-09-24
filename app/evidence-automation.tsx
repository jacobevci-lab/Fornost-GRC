"use client";

import { FormEvent, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import "./evidence-automation.css";

type Lang = "tr" | "en";
type Source = {
  id:string; name:string; vendor:string; category:string; driver:string; enabled:boolean;
  config:Record<string,string>; hasSecret:boolean; lastTestStatus?:string; lastTestAt?:string;
};
type Rule = {
  id:string; name:string; sourceId:string; controlRefs:string; jsonPath:string; operator:string; expected:string;
  schedule:string; enabled:boolean; lastStatus?:string; lastRunAt?:string; freshnessHours:number;
  failureThreshold:number; consecutiveFailures:number; autoFinding:boolean; remediationOwner:string;
  remediationDueDays:number; nextRunAt?:string; lastEvidenceAt?:string; freshness:string; health:string;
};
type Run = {
  id:string; ruleName:string; sourceName:string; status:string; score:number; detail:string; evidenceId?:string;
  createdAt:string; triggerType?:string; durationMs?:number; errorCode?:string;
};
type Finding = {
  id:string; ruleId:string; evidenceId?:string; title:string; severity:string; owner:string; dueDate:string;
  status:string; detail:string; occurrenceCount:number; createdAt:string; acknowledgedBy?:string;
};
type PromotionDraft = {
  finding: Finding;
  targetControlRef: string;
  reviewer: string;
  dueDate: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
};

const catalog = [
  ["Cloud & SaaS","Microsoft 365 / Graph","microsoft-graph"],["Cloud & SaaS","Azure","azure-rest"],["Cloud & SaaS","AWS","aws-api"],["Cloud & SaaS","Google Cloud","gcp-api"],["Cloud & SaaS","Cloudflare","cloudflare-api"],["Cloud & SaaS","GitHub / GitLab","devops-api"],
  ["Firewall & Network","Fortinet FortiGate / FortiAnalyzer","rest-json"],["Firewall & Network","Palo Alto / Panorama","rest-json"],["Firewall & Network","Cisco Secure Firewall","rest-json"],["Firewall & Network","Check Point","rest-json"],["Firewall & Network","Juniper / Aruba / F5","rest-json"],
  ["XDR, EDR & SIEM","Microsoft Defender XDR / Sentinel","rest-json"],["XDR, EDR & SIEM","CrowdStrike Falcon","rest-json"],["XDR, EDR & SIEM","Palo Alto Cortex XDR","rest-json"],["XDR, EDR & SIEM","SentinelOne","rest-json"],["XDR, EDR & SIEM","Splunk / QRadar / Elastic / Wazuh","rest-json"],
  ["IAM, PAM & IGA","Microsoft Entra ID","microsoft-graph"],["IAM, PAM & IGA","Okta","rest-json"],["IAM, PAM & IGA","CyberArk / Segura / BeyondTrust","rest-json"],["IAM, PAM & IGA","SailPoint / Saviynt / One Identity","rest-json"],["IAM, PAM & IGA","LDAP / Active Directory Bridge","https-bridge"],
  ["Data, DB & Application","Purview DLP / EDM","microsoft-graph"],["Data, DB & Application","Imperva / IBM Guardium DAM","rest-json"],["Data, DB & Application","Oracle / SQL Server / PostgreSQL","https-bridge"],["Data, DB & Application","Tenable / Qualys / Rapid7","rest-json"],["Data, DB & Application","Checkmarx / SonarQube / Snyk","rest-json"],
  ["Work & Custom","Jira / ServiceNow / Azure DevOps","rest-json"],["Work & Custom","Generic REST / JSON API","rest-json"],["Work & Custom","Webhook Receiver","webhook"],["Work & Custom","On-prem HTTPS Collector Bridge","https-bridge"],
] as const;

function splitControlRefs(value:string){
  const refs:string[]=[];const seen=new Set<string>();
  for(const part of String(value||"").split(/[;,|\n]+/).map(entry=>entry.trim()).filter(Boolean)){
    const key=part.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if(seen.has(key))continue;seen.add(key);refs.push(part);
  }
  return refs;
}

export default function EvidenceAutomation({lang,currentUser}:{lang:Lang;currentUser:{role:string}}){
  const tr=lang==="tr";
  const [tab,setTab]=useState<"overview"|"sources"|"rules"|"runs"|"findings">("overview");
  const [sources,setSources]=useState<Source[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [findings,setFindings]=useState<Finding[]>([]);
  const [summary,setSummary]=useState({healthy:0,failing:0,stale:0,due:0,openFindings:0});
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [sourceOpen,setSourceOpen]=useState(false);
  const [ruleOpen,setRuleOpen]=useState(false);
  const [closing,setClosing]=useState<Finding|null>(null);
  const [promotion,setPromotion]=useState<PromotionDraft|null>(null);
  const [closure,setClosure]=useState({note:"",evidenceReference:"",evidenceSha256:"",confirmation:""});

  const categoryLabel=(value:string)=>tr?({"Cloud & SaaS":"Bulut ve SaaS","Firewall & Network":"Güvenlik Duvarı ve Ağ","XDR, EDR & SIEM":"XDR, EDR ve SIEM","IAM, PAM & IGA":"IAM, PAM ve IGA","Data, DB & Application":"Veri, Veritabanı ve Uygulama","Work & Custom":"İş Akışı ve Özel"}[value]||value):value;
  const scheduleLabel=(value:string)=>tr?({hourly:"Saatlik",daily:"Günlük",weekly:"Haftalık",monthly:"Aylık"}[value]||value):value;
  const formatDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"short",timeStyle:"short"}).format(date)};

  const [source,setSource]=useState({name:"",vendor:"Generic REST / JSON API",category:"Work & Custom",driver:"rest-json",baseUrl:"",authType:"bearer",headerName:"x-api-key",secret:""});
  const [rule,setRule]=useState({name:"",sourceId:"",controlRefs:"",jsonPath:"",operator:"exists",expected:"",schedule:"daily",freshnessHours:24,failureThreshold:2,remediationOwner:"",remediationDueDays:7,autoFinding:true});

  const applyData=(j:{sources?:Source[];rules?:Rule[];runs?:Run[];findings?:Finding[];summary?:typeof summary})=>{
    setSources(j.sources||[]);setRules(j.rules||[]);setRuns(j.runs||[]);setFindings(j.findings||[]);if(j.summary)setSummary(j.summary);
  };
  async function load(){const r=await fetch(withBasePath("/api/evidence-automation"),{cache:"no-store"});if(r.ok)applyData(await r.json())}
  useEffect(()=>{let live=true;fetch(withBasePath("/api/evidence-automation"),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>{if(live&&j)applyData(j)}).catch(()=>{});return()=>{live=false}},[]);

  async function api(body:Record<string,unknown>){
    setBusy(String(body.action||"save"));setMessage("");
    try{
      const r=await fetch(withBasePath("/api/evidence-automation"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json().catch(()=>({}));
      setMessage(r.ok?(j.message||(tr?"İşlem tamamlandı.":"Completed.")):(j.error||(tr?"İşlem başarısız.":"Operation failed.")));
      if(r.ok)await load();
      return r.ok;
    }catch{
      setMessage(tr?"Sunucuya ulaşılamadı.":"Server unavailable.");return false;
    }finally{setBusy("")}
  }
  async function saveSource(e:FormEvent){e.preventDefault();if(await api({action:"save-source",...source})){setSourceOpen(false);setSource({...source,name:"",baseUrl:"",secret:""})}}
  async function saveRule(e:FormEvent){e.preventDefault();if(await api({action:"save-rule",...rule})){setRuleOpen(false);setRule({...rule,name:"",controlRefs:"",jsonPath:"",expected:""})}}
  async function closeFinding(){if(!closing)return;if(await api({action:"close-finding",findingId:closing.id,...closure})){setClosing(null);setClosure({note:"",evidenceReference:"",evidenceSha256:"",confirmation:""})}}

  function startPromotion(finding:Finding){
    const mapped=splitControlRefs(rules.find(item=>item.id===finding.ruleId)?.controlRefs||"");
    setPromotion({finding,targetControlRef:mapped.length===1?mapped[0]:"",reviewer:"",dueDate:finding.dueDate||"",rootCause:"",correctiveAction:"",preventiveAction:""});
  }
  async function promoteFinding(e:FormEvent){
    e.preventDefault();if(!promotion)return;
    setBusy("queue-capa-promotion");setMessage("");
    try{
      const {finding,...governance}=promotion;
      const r=await fetch(withBasePath("/api/continuous-assurance"),{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"queue-capa-promotion",findingId:finding.id,...governance}),
      });
      const j=await r.json().catch(()=>({})) as {message?:string;error?:string;candidate?:{reasons?:string[]}};
      const reasonText=Array.isArray(j.candidate?.reasons)&&j.candidate.reasons.length?` ${j.candidate.reasons.join(" · ")}`:"";
      setMessage(r.ok?(j.message||(tr?"CAPA inceleme kuyruğuna alındı.":"CAPA review queued.")):`${j.error||(tr?"CAPA inceleme kuyruğu işlemi başarısız.":"CAPA review queue failed.")}${reasonText}`);
      if(r.ok)setPromotion(null);
    }catch{setMessage(tr?"Sürekli güvence servisine ulaşılamadı.":"Continuous assurance service unavailable.")}
    finally{setBusy("")}
  }
  function pick(entry:typeof catalog[number]){setSource({name:entry[1],vendor:entry[1],category:entry[0],driver:entry[2],baseUrl:"",authType:"bearer",headerName:"x-api-key",secret:""});setSourceOpen(true)}

  return <section className="ea-page">
    <div className="ea-hero"><div><small>{tr?"SÜREKLİ GÜVENCE":"CONTINUOUS ASSURANCE"}</small><h2>{tr?"Kanıt Otomasyonu":"Evidence Automation"}</h2><p>{tr?"Her üreticiden API kanıtı topla, kuralla doğrula, kontrol maddelerine bağla ve başarısız sinyali bağımsız onaylı CAPA akışına taşı.":"Collect API evidence from any vendor, validate it, map it to controls and route failed assurance signals through independently approved CAPA governance."}</p></div><div className="ea-hero-actions"><span className="ea-live"><i/>{tr?"Collector hazır":"Collector ready"}</span>{currentUser.role==="Admin"&&<button className="primary" onClick={()=>setSourceOpen(true)}>+ {tr?"Kaynak Ekle":"Add Source"}</button>}</div></div>
    {message&&<div className="ea-message" onClick={()=>setMessage("")}>{message}<b>×</b></div>}
    <div className="ea-stats ea-stats-wide"><Metric value={summary.healthy} label={tr?"Sağlıklı kontrol":"Healthy controls"}/><Metric value={summary.failing} label={tr?"Başarısız kontrol":"Failing controls"}/><Metric value={summary.stale} label={tr?"Eski/eksik kanıt":"Stale/missing evidence"}/><Metric value={summary.due} label={tr?"Çalışması gereken":"Due controls"}/><Metric value={summary.openFindings} label={tr?"Açık bulgu":"Open findings"}/></div>
    <div className="ea-tabs">{(["overview","sources","rules","runs","findings"] as const).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x==="overview"?(tr?"Connector Kataloğu":"Connector Catalog"):x==="sources"?(tr?"Kanıt Kaynakları":"Evidence Sources"):x==="rules"?(tr?"Sürekli Kontroller":"Continuous Controls"):x==="runs"?(tr?"Çalıştırma Geçmişi":"Run History"):(tr?"Bulgular ve CAPA":"Findings & CAPA")}</button>)}</div>

    {tab==="overview"&&<div className="ea-catalog">{Array.from(new Set(catalog.map(x=>x[0]))).map(group=><article key={group}><header><h3>{categoryLabel(group)}</h3><span>{catalog.filter(x=>x[0]===group).length}</span></header><div>{catalog.filter(x=>x[0]===group).map(entry=><button key={entry[1]} onClick={()=>pick(entry)}><b>{entry[1]}</b><small>{entry[2]==="https-bridge"?(tr?"Şirket içi köprü":"On-prem bridge"):(tr?"API şablonu":"API template")}</small><i>+</i></button>)}</div></article>)}</div>}
    {tab==="sources"&&<DataTable empty={tr?"Henüz kanıt kaynağı eklenmedi.":"No evidence source yet."} heads={[tr?"Kaynak":"Source",tr?"Kategori":"Category",tr?"Sürücü":"Driver",tr?"Son test":"Last test",tr?"Durum":"Status",""]} rows={sources.map(x=>[<span key="source"><b>{x.name}</b><small>{x.vendor}</small></span>,categoryLabel(x.category),x.driver,x.lastTestAt?formatDate(x.lastTestAt):"—",<Status key="status" value={x.lastTestStatus||"not-tested"} lang={lang}/>,<button key="test" className="ghost" disabled={!!busy} onClick={()=>api({action:"test-source",sourceId:x.id})}>{tr?"Bağlantıyı Test Et":"Test Connection"}</button>])}/>}
    {tab==="rules"&&<><div className="ea-section-action"><p>{tr?"Kontrolleri takvime bağla; kanıt tazeliğini, ardışık hataları ve otomatik CAPA akışını tek yerden yönet.":"Schedule controls and manage evidence freshness, consecutive failures and automated CAPA in one place."}</p><div>{currentUser.role!=="Viewer"&&<button className="ghost" disabled={!!busy} onClick={()=>api({action:"run-due"})}>{tr?"Zamanı Gelenleri Çalıştır":"Run Due"}</button>}{currentUser.role==="Admin"&&<button className="primary" onClick={()=>setRuleOpen(true)}>+ {tr?"Kontrol Ekle":"Add Control"}</button>}</div></div><DataTable empty={tr?"Henüz sürekli kontrol yok.":"No continuous control yet."} heads={[tr?"Kontrol":"Control",tr?"Kaynak / maddeler":"Source / controls",tr?"Sağlık":"Health",tr?"Kanıt tazeliği":"Evidence freshness",tr?"Sonraki çalışma":"Next run",""]} rows={rules.map(x=>[<span key="rule"><b>{x.name}</b><small>{scheduleLabel(x.schedule)} · {tr?`${x.failureThreshold} hata eşiği`:`threshold ${x.failureThreshold}`}</small></span>,<span key="map"><b>{sources.find(s=>s.id===x.sourceId)?.name||"—"}</b><small>{x.controlRefs}</small></span>,<Status key="health" value={x.health} lang={lang}/>,<span key="fresh"><b>{x.freshness}</b><small>{x.lastEvidenceAt?formatDate(x.lastEvidenceAt):"—"}</small></span>,x.nextRunAt?formatDate(x.nextRunAt):"—",<div key="actions" className="ea-row-actions"><button className="primary" disabled={!!busy} onClick={()=>api({action:"run-rule",ruleId:x.id})}>{tr?"Çalıştır":"Run"}</button>{currentUser.role==="Admin"&&<button className="ghost" disabled={!!busy} onClick={()=>api({action:"toggle-rule",ruleId:x.id,enabled:!x.enabled})}>{x.enabled?(tr?"Duraklat":"Pause"):(tr?"Etkinleştir":"Enable")}</button>}</div>])}/></>}
    {tab==="runs"&&<DataTable empty={tr?"Henüz çalıştırma kaydı yok.":"No collection runs yet."} heads={[tr?"Kural":"Rule",tr?"Kaynak":"Source",tr?"Sonuç":"Result",tr?"Tetikleyici":"Trigger",tr?"Süre":"Duration",tr?"Açıklama":"Detail",tr?"Zaman":"Time"]} rows={runs.map(x=>[x.ruleName,x.sourceName,<Status key="status" value={x.status} lang={lang}/>,x.triggerType||"manual",`${x.durationMs||0} ms`,x.detail,formatDate(x.createdAt)])}/>}
    {tab==="findings"&&<DataTable empty={tr?"Açık veya geçmiş kontrol bulgusu yok.":"No current or historical control findings."} heads={[tr?"Bulgu":"Finding",tr?"Önem":"Severity",tr?"Sahip / termin":"Owner / due",tr?"Tekrar":"Occurrences",tr?"Durum":"Status",tr?"Yönetim":"Governance"]} rows={findings.map(x=>[
      <span key="finding"><b>{x.title}</b><small>{x.detail}</small></span>,
      x.severity,
      <span key="owner"><b>{x.owner}</b><small>{x.dueDate}</small></span>,
      x.occurrenceCount,
      <Status key="status" value={x.status} lang={lang}/>,
      <div key="actions" className="ea-row-actions">
        {x.status!=="closed"&&currentUser.role!=="Viewer"&&<button className="primary" disabled={!!busy} onClick={()=>startPromotion(x)}>{tr?"CAPA İncelemesine Gönder":"Queue CAPA Review"}</button>}
        {x.status==="open"&&<button className="ghost" disabled={!!busy||currentUser.role==="Viewer"} onClick={()=>api({action:"acknowledge-finding",findingId:x.id})}>{tr?"Sahiplen":"Acknowledge"}</button>}
        {x.status!=="open"&&x.status!=="closed"&&currentUser.role==="Admin"&&<button className="ghost" disabled={!!busy} onClick={()=>setClosing(x)}>{tr?"Kanıtla Kapat":"Close with Evidence"}</button>}
        {x.status==="closed"&&<span>—</span>}
      </div>,
    ])}/>}

    {sourceOpen&&<Modal title={tr?"Kanıt kaynağı ekle":"Add evidence source"} closeLabel={tr?"Pencereyi kapat":"Close dialog"} onClose={()=>setSourceOpen(false)}><form className="ea-form" onSubmit={saveSource}><label>{tr?"Kaynak adı":"Source name"}<input required value={source.name} onChange={e=>setSource({...source,name:e.target.value})}/></label><label>{tr?"Kategori":"Category"}<select value={source.category} onChange={e=>setSource({...source,category:e.target.value})}>{Array.from(new Set(catalog.map(x=>x[0]))).map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></label><label className="wide">API Base URL<input required type="url" placeholder="https://api.vendor.com/v1" value={source.baseUrl} onChange={e=>setSource({...source,baseUrl:e.target.value})}/></label><label>{tr?"Kimlik doğrulama":"Authentication"}<select value={source.authType} onChange={e=>setSource({...source,authType:e.target.value})}><option value="bearer">Bearer token</option><option value="api-key">API key header</option><option value="basic">Basic auth</option><option value="none">{tr?"Yok":"None"}</option></select></label><label>{tr?"Token / API anahtarı":"Token / API key"}<input type="password" autoComplete="new-password" value={source.secret} onChange={e=>setSource({...source,secret:e.target.value})} placeholder={tr?"Şifreli saklanır":"Stored encrypted"}/></label><footer><button type="button" className="ghost" onClick={()=>setSourceOpen(false)}>{tr?"Vazgeç":"Cancel"}</button><button className="primary" disabled={!!busy}>{tr?"Kaynağı Kaydet":"Save Source"}</button></footer></form></Modal>}

    {ruleOpen&&<Modal title={tr?"Sürekli kontrol tanımla":"Define continuous control"} closeLabel={tr?"Pencereyi kapat":"Close dialog"} onClose={()=>setRuleOpen(false)}><form className="ea-form" onSubmit={saveRule}><label className="wide">{tr?"Kontrol testi adı":"Control test name"}<input required value={rule.name} onChange={e=>setRule({...rule,name:e.target.value})}/></label><label>{tr?"Kanıt kaynağı":"Evidence source"}<select required value={rule.sourceId} onChange={e=>setRule({...rule,sourceId:e.target.value})}><option value="">—</option>{sources.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>{tr?"Zamanlama":"Schedule"}<select value={rule.schedule} onChange={e=>setRule({...rule,schedule:e.target.value})}><option value="hourly">{tr?"Saatlik":"Hourly"}</option><option value="daily">{tr?"Günlük":"Daily"}</option><option value="weekly">{tr?"Haftalık":"Weekly"}</option><option value="monthly">{tr?"Aylık":"Monthly"}</option></select></label><label className="wide">{tr?"Bağlı kontrol/maddeler":"Mapped controls"}<input required placeholder="CC6.1, A.5.15, PCI 8.4.2" value={rule.controlRefs} onChange={e=>setRule({...rule,controlRefs:e.target.value})}/></label><label>JSON path<input placeholder="data.compliantPercentage" value={rule.jsonPath} onChange={e=>setRule({...rule,jsonPath:e.target.value})}/></label><label>{tr?"Operatör":"Operator"}<select value={rule.operator} onChange={e=>setRule({...rule,operator:e.target.value})}><option value="exists">{tr?"mevcut":"exists"}</option><option value="eq">{tr?"eşittir":"equals"}</option><option value="gte">≥</option><option value="lte">≤</option><option value="contains">{tr?"içerir":"contains"}</option></select></label><label className="wide">{tr?"Beklenen değer":"Expected value"}<input value={rule.expected} onChange={e=>setRule({...rule,expected:e.target.value})}/></label><label>{tr?"Kanıt tazeliği (saat)":"Evidence freshness (hours)"}<input required type="number" min="1" max="8760" value={rule.freshnessHours} onChange={e=>setRule({...rule,freshnessHours:Number(e.target.value)})}/></label><label>{tr?"Ardışık hata eşiği":"Consecutive failure threshold"}<input required type="number" min="1" max="20" value={rule.failureThreshold} onChange={e=>setRule({...rule,failureThreshold:Number(e.target.value)})}/></label><label>{tr?"Düzeltme sahibi":"Remediation owner"}<input type="email" value={rule.remediationOwner} onChange={e=>setRule({...rule,remediationOwner:e.target.value})}/></label><label>{tr?"Düzeltme süresi (gün)":"Remediation due (days)"}<input required type="number" min="1" max="365" value={rule.remediationDueDays} onChange={e=>setRule({...rule,remediationDueDays:Number(e.target.value)})}/></label><label className="wide ea-check"><input type="checkbox" checked={rule.autoFinding} onChange={e=>setRule({...rule,autoFinding:e.target.checked})}/><span>{tr?"Eşik aşılınca otomatik bulgu ve risk kaydı oluştur":"Create a finding and risk record when threshold is reached"}</span></label><footer><button type="button" className="ghost" onClick={()=>setRuleOpen(false)}>{tr?"Vazgeç":"Cancel"}</button><button className="primary" disabled={!!busy}>{tr?"Sürekli Kontrolü Kaydet":"Save Continuous Control"}</button></footer></form></Modal>}

    {promotion&&<Modal title={tr?"CAPA inceleme kuyruğuna gönder":"Queue for CAPA review"} closeLabel={tr?"Pencereyi kapat":"Close dialog"} onClose={()=>setPromotion(null)}><form className="ea-form" onSubmit={promoteFinding}><div className="wide"><small>{tr?"KAYNAK SÜREKLİ GÜVENCE BULGUSU":"SOURCE CONTINUOUS ASSURANCE FINDING"}</small><b>{promotion.finding.title}</b><small>{rules.find(x=>x.id===promotion.finding.ruleId)?.controlRefs||promotion.finding.ruleId}</small></div><label>{tr?"Hedef kontrol":"Target control"}<select required value={promotion.targetControlRef} onChange={e=>setPromotion({...promotion,targetControlRef:e.target.value})}><option value="">—</option>{splitControlRefs(rules.find(x=>x.id===promotion.finding.ruleId)?.controlRefs||"").map(controlRef=><option key={controlRef} value={controlRef}>{controlRef}</option>)}</select></label><label>{tr?"Bağımsız reviewer e-posta":"Independent reviewer email"}<input required type="email" value={promotion.reviewer} onChange={e=>setPromotion({...promotion,reviewer:e.target.value})}/></label><label>{tr?"CAPA termini":"CAPA due date"}<input required type="date" value={promotion.dueDate} onChange={e=>setPromotion({...promotion,dueDate:e.target.value})}/></label><label className="wide">{tr?"Kök neden":"Root cause"}<textarea required value={promotion.rootCause} onChange={e=>setPromotion({...promotion,rootCause:e.target.value})}/></label><label className="wide">{tr?"Düzeltici aksiyon":"Corrective action"}<textarea required value={promotion.correctiveAction} onChange={e=>setPromotion({...promotion,correctiveAction:e.target.value})}/></label><label className="wide">{tr?"Önleyici aksiyon":"Preventive action"}<textarea required value={promotion.preventiveAction} onChange={e=>setPromotion({...promotion,preventiveAction:e.target.value})}/></label><div className="wide"><small>{tr?"Hedef kontrol sunucuda otomasyon kuralının gerçek eşlemelerine karşı doğrulanır; risk, otomasyon kuralı ve SHA-256 kaynak kanıt izi de sunucuda çözülür. Kayıt doğrudan CAPA oluşturmaz; bağımsız Admin onayına gider ve işi kuyruğa alan kişi kendi kaydını onaylayamaz.":"The target control is validated server-side against the automation rule's actual mappings; risk, automation rule and SHA-256 source-evidence lineage are also resolved server-side. This does not create CAPA directly; an independent Admin must approve it, and the queue actor cannot approve their own item."}</small></div><footer><button type="button" className="ghost" onClick={()=>setPromotion(null)}>{tr?"Vazgeç":"Cancel"}</button><button className="primary" disabled={!!busy}>{tr?"CAPA İncelemesini Kuyruğa Al":"Queue CAPA Review"}</button></footer></form></Modal>}

    {closing&&<Modal title={tr?"Bulguyu bağımsız kanıtla kapat":"Close finding with independent evidence"} closeLabel={tr?"Pencereyi kapat":"Close dialog"} onClose={()=>setClosing(null)}><div className="ea-form"><label className="wide">{tr?"Kapanış ve doğrulama notu":"Closure and verification note"}<input value={closure.note} onChange={e=>setClosure({...closure,note:e.target.value})}/></label><label>{tr?"Kanıt referansı":"Evidence reference"}<input value={closure.evidenceReference} onChange={e=>setClosure({...closure,evidenceReference:e.target.value})}/></label><label>SHA-256<input maxLength={64} value={closure.evidenceSha256} onChange={e=>setClosure({...closure,evidenceSha256:e.target.value})}/></label><label className="wide">{tr?'Onay için "BULGUYU KAPAT" yazın':'Type "BULGUYU KAPAT" to confirm'}<input value={closure.confirmation} onChange={e=>setClosure({...closure,confirmation:e.target.value})}/></label><footer><button className="ghost" onClick={()=>setClosing(null)}>{tr?"Vazgeç":"Cancel"}</button><button className="primary" disabled={!!busy} onClick={()=>void closeFinding()}>{tr?"Kanıtla Kapat":"Close with Evidence"}</button></footer></div></Modal>}
  </section>;
}

function Metric({value,label}:{value:number;label:string}){return <div><b>{value}</b><span>{label}</span></div>}
function Status({value,lang}:{value:string;lang:Lang}){const tr=lang==="tr",labels:Record<string,string>={pass:tr?"Uygun":"Passed",fail:tr?"Başarısız":"Failed",success:tr?"Bağlı":"Connected",error:tr?"Hata":"Error",healthy:tr?"Sağlıklı":"Healthy",failing:tr?"Başarısız":"Failing",stale:tr?"Kanıt eski":"Stale",missing:tr?"Kanıt eksik":"Missing",expiring:tr?"Süresi doluyor":"Expiring",paused:tr?"Duraklatıldı":"Paused",open:tr?"Açık":"Open",acknowledged:tr?"Sahiplenildi":"Acknowledged",closed:tr?"Kapalı":"Closed"};return <span className={`ea-status ${value}`}>{labels[value]||(tr?"Test edilmedi":"Not tested")}</span>}
function DataTable({heads,rows,empty}:{heads:string[];rows:React.ReactNode[][];empty:string}){return <div className="ea-table"><div className="table-wrap"><table><thead><tr>{heads.map((x,i)=><th key={`${x}-${i}`}>{x}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>):<tr><td colSpan={heads.length} className="empty">{empty}</td></tr>}</tbody></table></div></div>}
function Modal({title,closeLabel="Close dialog",onClose,children}:{title:string;closeLabel?:string;onClose:()=>void;children:React.ReactNode}){return <div className="overlay" onMouseDown={onClose}><div className="modal ea-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><small>FORNOST COLLECTOR</small><h2>{title}</h2></div><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></div>{children}</div></div>}
