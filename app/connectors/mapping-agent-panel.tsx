"use client";
import { useEffect, useRef, useState } from 'react';
import { withBasePath } from '../base-path';
import type { MappingReport } from '../evidence/mapping-agent';
import './mapping-agent-panel.css';

export type MappingSelection={runId:string;index:number;sourceId:string;templateId:string;controlRef:string;rationale:string};
const errors:Record<string,[string,string]>={
 MAPPING_AI_DISABLED:['AI ajanı etkin değil. AI ayarlarını ve operasyon politikasını kontrol edin.','The AI agent is disabled. Check AI settings and operating policy.'],
 MAPPING_DATA_POLICY:['Veri politikası bu analize izin vermiyor. Kontrol içeriğini ve AI veri kapsamını inceleyin.','The data policy blocks this analysis. Review control content and AI data scope.'],
 MAPPING_SOURCE_UNSUPPORTED:['Bu kaynak için ajan testi yok veya kaynak duraklatılmış.','This source has no supported agent test or is paused.'],
 MAPPING_NO_CONTROLS:['Eşleştirilecek erişilebilir kontrol yok. Önce Kontroller modülüne kontrol ekleyin.','No eligible controls to map. Add controls in the Controls module first.'],
 MAPPING_INCOMPLETE_COLLECTION:['Kaynak verisi testleri doğrulamaya yetmedi. İzinleri, kapsamı ve veri güncelliğini inceleyin.','Source data could not verify the tests. Review permissions, scope and freshness.'],
 MAPPING_STALE:['Kaynak değişti. Güncel kaynakla yeniden analiz edin.','The source changed. Analyse the current source again.'],
 MAPPING_RATE_LIMIT:['Kısa sürede çok fazla analiz istendi. Bir dakika sonra tekrar deneyin.','Too many analyses requested. Try again in one minute.'],
 MAPPING_BUDGET:['AI kullanım bütçesi doldu. Manuel eşleştirme kullanılabilir.','The AI usage budget is exhausted. Manual mapping remains available.'],
 MAPPING_INVALID_RESPONSE:['AI yanıtı doğrulanamadı; hiçbir eşleme uygulanmadı.','The AI response could not be validated; no mapping was applied.'],
 MAPPING_FAILED:['Analiz tamamlanamadı. Bağlantı ve AI sağlayıcısı durumunu kontrol edin; hiçbir eşleme uygulanmadı.','Analysis could not complete. Check the source and AI provider; no mapping was applied.'],
};
export default function MappingAgentPanel({sourceId,sourceName,lang,onPrepare}:{sourceId:string;sourceName:string;lang:'tr'|'en';onPrepare:(selection:MappingSelection)=>void}){
 const tr=lang==='tr',pending=useRef(false),abort=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<{runId:string;report:MappingReport}|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function analyse(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setResult(null);
  const controller=new AbortController();abort.current=controller;const timeout=setTimeout(()=>controller.abort(),150000);
  try{
   const response=await fetch(withBasePath('/api/evidence-automation/mapping-agent'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceId,lang}),signal:controller.signal});
   const body=await response.json();if(!response.ok)throw new Error(body.code||'MAPPING_FAILED');
   if(!body.runId||!Array.isArray(body.report?.proposals))throw new Error('MAPPING_INVALID_RESPONSE');
   setResult(body);
  }catch(e){if(abort.current===controller)setError(e instanceof Error?e.message:'MAPPING_FAILED');}
  finally{clearTimeout(timeout);pending.current=false;setBusy(false);}
 }
 return <div className="mapping-agent-panel">
  <p><b>{sourceName}</b></p>
  <p>{tr?'Ajan kaynaktan güncel veriyi okur, hazır testleri değerlendirir ve kurumunuzdaki kontrollerle gerekçeli eşleştirme önerir.':'The agent reads current source data, evaluates ready tests and proposes reasoned mappings to your controls.'}</p>
  <p className="mapping-agent-note">{tr?'Yapılandırılmış AI sağlayıcısına toplu test sonuçları ve izin verilen kontrol açıklamaları gönderilir. Kimlik bilgileri, cihaz kimlikleri ve ham kaynak verisi gönderilmez. Öneriler uyumluluk onayı değildir.':'Aggregate test results and permitted control descriptions are sent to the configured AI provider. Credentials, device identities and raw source data are excluded. Proposals are not compliance approval.'}</p>
  <button className="primary" disabled={busy} onClick={()=>void analyse()}>{busy?(tr?'Toplanıyor ve analiz ediliyor…':'Collecting and analysing…'):(tr?'Kanıtı incele ve eşleştir':'Inspect evidence and map')}</button>
  {busy&&<p role="status">{tr?'Bağlantı → veri toplama → test değerlendirme → AI eşleştirme.':'Connection → collection → test assessment → AI mapping.'}</p>}
  {error&&<p role="alert">{(errors[error]||errors.MAPPING_FAILED)[tr?0:1]}</p>}
  {result&&<section aria-label={tr?'Eşleştirme önerileri':'Mapping proposals'}>
   <h3>{tr?'İnceleme sonucu':'Analysis result'}</h3><p>{result.report.summary}</p>
   <p className="mapping-agent-note">{tr?'Bu bir ön incelemedir. Hazır kontrolü onaylayıp çalıştırdığınızda Kanıtlar modülüne yeni kayıt eklenir. Kapsam yalnız bağlantı hesabının görebildiği kayıtlardır.':'This is a preview. Approve and run the ready control to create a new Evidence record. Scope covers only records visible to the connection account.'}</p>
   <small>{tr?'Toplama zamanı: ':'Collected: '}{new Date(result.report.collectedAt).toLocaleString(lang==='tr'?'tr-TR':'en-GB')}</small>
   {result.report.catalogTruncated&&<p role="status">{tr?'Kontrol kataloğunun sınırlı bir bölümü incelendi; sonuç tüm kontrolleri kapsamaz.':'A bounded subset of the control catalog was analysed; results do not cover every control.'}</p>}
   {!result.report.proposals.length&&<p role="status">{tr?'Gerekçelendirilebilir eşleştirme bulunamadı. Kontrol açıklamalarını ve kaynak kapsamını inceleyin.':'No defensible mapping found. Review control descriptions and source scope.'}</p>}
   {result.report.proposals.map((proposal,index)=>{
    const control=result.report.controls.find(c=>c.id===proposal.controlId),test=result.report.assessments.find(a=>a.templateId===proposal.templateId);
    return <article key={`${proposal.templateId}:${proposal.controlId}`}>
     <h4>{control?.ref} · {control?.title}</h4><p><b>{test?.name}</b></p>
     <p>{tr?'Test sonucu':'Test result'}: {test?.status==='pass'?(tr?'Geçti':'Passed'):(tr?'Başarısız':'Failed')} · {tr?'Geçen / başarısız / doğrulanamayan':'Passed / failed / unverified'}: {test?.passed} / {test?.failed} / {test?.unknown}</p>
     <p><b>{tr?'Neden ilgili? ':'Why relevant? '}</b>{proposal.rationale}</p>
     <p><b>{tr?'Kalan kanıt ihtiyacı: ':'Remaining evidence needed: '}</b>{proposal.missingEvidence}</p>
     <button className="ghost" onClick={()=>onPrepare({runId:result.runId,index,sourceId,templateId:proposal.templateId,controlRef:control!.ref,rationale:proposal.rationale})}>{tr?'Eşlemeyi incele ve kontrolü hazırla':'Review mapping and prepare control'}</button>
    </article>;
   })}
  </section>}
 </div>;
}
