import type { FormEvent } from "react";

type DraftKind="risk-treatment"|"audit-finding"|"remediation-task";
export type AgentKind="risk"|"audit"|"compliance"|"evidence";
export type AgentFinding={id:string;title:string;summary:string;severity:"Low"|"Medium"|"High"|"Critical";confidence:number;sourceRefs:string[];recommendation:string;draft:{kind:DraftKind;title:string;rationale:string;payload:Record<string,string>}};
export type AgentRun={id:string;kind:AgentKind;objective:string;status:"running"|"completed"|"approved"|"archived"|"failed";report:{executiveSummary:string;findings:AgentFinding[]}|null;sourceRefs:string[];provider:string;model:string;profile:string;latencyMs:number;createdBy:string;createdAt:string;reviewedBy:string|null;reviewNote:string|null;draftLinks:Array<{findingId:string;draftId:string;note:string;createdBy:string;createdAt:string}>};
export type AgentDecision={id:string;status:"approved"|"archived";note:string;confirmation:string};
export type AgentConversion={runId:string;findingId:string;note:string;confirmation:string};

export default function FornostAiAgents({role,aiReady,runs,kind,setKind,objective,setObjective,busy,notice,decision,setDecision,conversion,setConversion,onRun,onReview,onConvert,onDelete,onReload}:{
  role:"Admin"|"Editor"|"Viewer";aiReady:boolean;runs:AgentRun[];kind:AgentKind;setKind:(value:AgentKind)=>void;objective:string;setObjective:(value:string)=>void;busy:boolean;notice:string;
  decision:AgentDecision|null;setDecision:(value:AgentDecision|null)=>void;conversion:AgentConversion|null;setConversion:(value:AgentConversion|null)=>void;
  onRun:(event:FormEvent)=>void;onReview:()=>void;onConvert:()=>void;onDelete:(id:string)=>void;onReload:()=>void;
}){
  return <div className="fornost-ai-agents">
    <div className="fornost-ai-security-note"><b>AI Assurance Agentları</b><p>Yalnız insan tarafından başlatılır, en fazla sekiz kaynaklı bulgu üretir ve canlı GRC kaydını değiştirmez. Bir bulgunun taslak kuyruğuna aktarılması ayrıca Admin onayı ister.</p></div>
    {role!=="Viewer"&&<form className="fornost-ai-agent-form" onSubmit={onRun}>
      <label><span>Agent</span><select value={kind} onChange={event=>setKind(event.target.value as AgentKind)}><option value="risk">Risk Agent</option><option value="audit">Audit Agent</option><option value="compliance">Compliance Agent</option><option value="evidence">Evidence Agent</option></select></label>
      <label><span>Analiz hedefi</span><textarea rows={3} maxLength={1600} value={objective} onChange={event=>setObjective(event.target.value)} placeholder="Örn: Kritik varlıklardaki yüksek riskleri, gecikmiş aksiyonları ve sahiplik boşluklarını analiz et."/></label>
      <button disabled={busy||!aiReady||objective.trim().length<5}>{busy?"Çalışıyor…":"Agentı Çalıştır"}</button>
    </form>}
    {notice&&<div className="fornost-ai-notice">{notice}</div>}
    <div className="fornost-ai-agent-toolbar"><b>Son çalışmalar</b><button disabled={busy} onClick={onReload}>Yenile</button></div>
    {!runs.length&&<div className="fornost-ai-audit-empty">Henüz agent çalışması yok.</div>}
    <div className="fornost-ai-agent-runs">{runs.map(run=><article key={run.id}>
      <header><div><small>{run.kind} agent · {run.id}</small><b>{run.objective}</b></div><span className={run.status}>{run.status}</span></header>
      <p>{run.report?.executiveSummary||(run.status==="failed"?"Çalışma tamamlanamadı.":"Analiz sürüyor…")}</p>
      <div className="fornost-ai-agent-meta"><span>{run.provider} · {run.model} · {run.profile}</span><span>{run.latencyMs} ms</span><span>{run.createdBy}</span><span>{new Date(run.createdAt).toLocaleString("tr-TR")}</span></div>
      {run.reviewedBy&&<div className="fornost-ai-agent-review"><b>{run.reviewedBy}</b><span>{run.reviewNote}</span></div>}
      <div className="fornost-ai-agent-findings">{run.report?.findings.map(finding=>{
        const linked=run.draftLinks.find(link=>link.findingId===finding.id);
        return <section key={finding.id}>
          <header><b>{finding.title}</b><span className={finding.severity.toLowerCase()}>{finding.severity} · %{finding.confidence}</span></header>
          <p>{finding.summary}</p><em>{finding.recommendation}</em><footer>{finding.sourceRefs.map(ref=><span key={ref}>{ref}</span>)}</footer>
          {linked?<div className="fornost-ai-agent-linked">Taslak: {linked.draftId}</div>:run.status==="approved"&&role==="Admin"&&<button onClick={()=>setConversion({runId:run.id,findingId:finding.id,note:"",confirmation:""})}>Kontrollü Taslak Oluştur</button>}
          {conversion?.runId===run.id&&conversion.findingId===finding.id&&<div className="fornost-ai-agent-decision"><textarea rows={2} maxLength={800} placeholder="Taslağa aktarma gerekçesi" value={conversion.note} onChange={event=>setConversion({...conversion,note:event.target.value})}/><input placeholder="TASLAK OLUŞTUR" value={conversion.confirmation} onChange={event=>setConversion({...conversion,confirmation:event.target.value})}/><div><button onClick={()=>setConversion(null)}>Vazgeç</button><button disabled={busy||conversion.note.trim().length<5||conversion.confirmation!=="TASLAK OLUŞTUR"} onClick={onConvert}>Taslağa Aktar</button></div></div>}
        </section>;
      })}</div>
      {role==="Admin"&&run.status==="completed"&&<div className="fornost-ai-agent-actions"><button className="archive" onClick={()=>setDecision({id:run.id,status:"archived",note:"",confirmation:""})}>Arşivle</button><button onClick={()=>setDecision({id:run.id,status:"approved",note:"",confirmation:""})}>Raporu Onayla</button></div>}
      {role==="Admin"&&run.status==="approved"&&<div className="fornost-ai-agent-actions"><button className="archive" onClick={()=>setDecision({id:run.id,status:"archived",note:"",confirmation:""})}>Arşivle</button></div>}
      {role==="Admin"&&(run.status==="failed"||run.status==="archived")&&!run.draftLinks.length&&<button className="fornost-ai-agent-delete" onClick={()=>onDelete(run.id)}>Çalışmayı Sil</button>}
      {decision?.id===run.id&&<div className="fornost-ai-agent-decision"><textarea rows={2} maxLength={800} placeholder="Zorunlu inceleme notu" value={decision.note} onChange={event=>setDecision({...decision,note:event.target.value})}/><input placeholder={decision.status==="approved"?"ONAYLA":"ARŞİVLE"} value={decision.confirmation} onChange={event=>setDecision({...decision,confirmation:event.target.value})}/><div><button onClick={()=>setDecision(null)}>Vazgeç</button><button disabled={busy||decision.note.trim().length<5||decision.confirmation!==(decision.status==="approved"?"ONAYLA":"ARŞİVLE")} onClick={onReview}>Kararı Kaydet</button></div></div>}
    </article>)}</div>
  </div>;
}
