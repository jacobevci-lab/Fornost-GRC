'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {navigateToFornost} from './navigation-focus';
import {findingLabel} from './findings/presentation';
import {FINDING_SEVERITIES,FINDING_TYPES,findingSlaDays} from './findings/domain';
import type {AuditWorkpaper} from './audit-workpapers';
import {workpaperCapaFinding,workpaperSampleKey,type WorkpaperCapaFields,type WorkpaperCapaLink} from './workpaper-capa';
import './workpaper-capa.css';
type State={actorEmail:string;auditName:string;revision:string;canCreate:boolean;links:WorkpaperCapaLink[];complete:boolean;people:{email:string;name:string;role:string}[];peopleComplete:boolean};
type Draft={id:string;reference:string;reason:string;fields:WorkpaperCapaFields};
const endpoint='/api/audits/workpapers/capa';
const labels:[keyof WorkpaperCapaFields,string,string,number][]=[['title','CAPA başlığı','CAPA title',240],['description','Bulgu açıklaması','Finding description',3000],['rootCause','Kök neden','Root cause',2400],['correctiveAction','Düzeltici aksiyon','Corrective action',2400],['preventiveAction','Önleyici aksiyon','Preventive action',2400]];
export function WorkpaperCapaPanel({paper,tr,readOnly,onReload,onBusy}:{paper:AuditWorkpaper;tr:boolean;readOnly:boolean;onReload:()=>void;onBusy:(busy:boolean)=>void}){
 const t=(a:string,b:string)=>tr?a:b,lang=tr?'tr':'en';
 const [data,setData]=useState<State|null>(null),[draft,setDraft]=useState<Draft|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false);
 const generation=useRef(0),sending=useRef(false),controller=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  const ticket=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  setLoading(true);setError('');setPreview('');
  try{
   const response=await fetch(withBasePath(`${endpoint}?auditId=${encodeURIComponent(paper.auditId)}&workpaperId=${encodeURIComponent(paper.id)}`),{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'unavailable');
   if(ticket!==generation.current)return;
   if(!Array.isArray(body.links)||!Array.isArray(body.people)||typeof body.revision!=='string'||typeof body.canCreate!=='boolean')throw new Error('unavailable');
   setData(body);setNeedsRefresh(false);
  }catch(e){if(ticket===generation.current){setData(null);setNeedsRefresh(true);setError(e instanceof Error?e.message:'unavailable');}}
  finally{if(ticket===generation.current)setLoading(false);}
 },[paper.id,paper.auditId]);
 const invalidate=useCallback(()=>{generation.current++;controller.current?.abort();writeController.current?.abort();},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,paper.revision,invalidate]);
 const stale=!!data&&data.revision!==paper.revision;
 const exceptions=paper.samples.filter(s=>s.result==='exception');
 const currentLink=draft?data?.links.find(l=>workpaperSampleKey(l.origin.sample.reference)===workpaperSampleKey(draft.reference)):null;
 const currentSample=draft?exceptions.find(s=>s.reference===draft.reference):null;
 const blocked=busy||loading||needsRefresh||stale||readOnly||!data?.canCreate;
 const stamp=JSON.stringify({draft,revision:paper.revision,loadedRevision:data?.revision});
 const messages:Record<string,[string,string]>={
  'independent-review':['Doğrulayıcı, CAPA sorumlusundan ve aktarımı yapan kişiden farklı olmalı.','The reviewer must differ from both the CAPA owner and the person promoting it.'],
  'capa-fields':['Başlık, açıklama, kök neden, aksiyon planı, farklı sorumlular ve önem seviyesine uygun termini tamamlayın.','Complete the title, description, root cause, action plan, distinct assignees and a due date within the severity SLA.'],
  fields:['Aktarım gerekçesini ve tüm zorunlu alanları kontrol edin.','Check the promotion reason and all required fields.'],
  conflict:['Kaynak veya yetkiler değişti. Planınız korunuyor; bağlantıları ve çalışma kâğıdını yenileyip yeniden önizleyin.','The source or permissions changed. Your plan is retained; refresh the links and workpaper, then preview again.'],
  'already-linked':['Bu örnek zaten bir CAPA’ya aktarıldı. Bağlantıları yenileyin.','This sample already has a CAPA. Refresh the links.'],
  assignee:['Aktif, tam erişimli bir aksiyon sahibi ve farklı bir Admin doğrulayıcı seçin.','Choose an active owner with full access and a different Admin reviewer.'],
  forbidden:['Bu işlem için tam denetim, kanıt ve CAPA erişimi gerekir.','Full audit, evidence and CAPA access is required.'],
  'approved-required':['Aktarım yalnız onaylı çalışma kâğıdından yapılabilir.','Only approved workpapers can be promoted.'],
  'exception-required':['Seçilen istisna veya sabitlenmiş kanıt artık kullanılamıyor.','The selected exception or pinned evidence is no longer available.'],
  'audit-closed':['Denetim kapalı. Yeni CAPA için önce denetimi gerekçeyle yeniden açın.','The audit is closed. Reopen it with a reason before creating CAPA.'],
 };
 function open(reference:string){const s=exceptions.find(s=>s.reference===reference);if(!s||blocked)return;setPreview('');setError('');setNotice('');setDraft({id:`FND-${crypto.randomUUID()}`,reference,reason:'',fields:{findingType:'nonconformity',title:`${paper.title} · ${reference}`.slice(0,240),description:s.note,severity:'medium',owner:paper.owner,reviewer:'',rootCause:'',correctiveAction:'',preventiveAction:'',dueDate:'',riskRef:'',controlRef:''}});}
 function patch(fields:Partial<WorkpaperCapaFields>){setPreview('');setDraft(d=>d&&({...d,fields:{...d.fields,...fields}}));}
 function prepare(){if(blocked||!draft||!data||!currentSample||currentLink)return;try{workpaperCapaFinding(draft.fields,{auditId:paper.auditId,auditName:data.auditName});if(draft.fields.reviewer===data.actorEmail)throw new Error('independent-review');if(draft.reason.trim().length<3)throw new Error('fields');setError('');setPreview(stamp);}catch(e){setError(e instanceof Error?e.message:'fields');}}
 async function create(){
  if(sending.current||blocked||!draft||!currentSample||currentLink||preview!==stamp)return;
  sending.current=true;setBusy(true);onBusy(true);setError('');const ticket=generation.current,abort=new AbortController();writeController.current=abort;
  try{
   const response=await fetch(withBasePath(endpoint),{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),body:JSON.stringify({auditId:paper.auditId,workpaperId:paper.id,findingId:draft.id,expectedRevision:paper.revision,reference:draft.reference,reason:draft.reason,fields:draft.fields})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'unavailable');if(ticket!==generation.current)return;
   setDraft(null);setPreview('');setNotice(body.code);await load();
  }catch(e){if(ticket===generation.current){setError(e instanceof Error?e.message:'unavailable');setNeedsRefresh(true);setPreview('');}}
  finally{sending.current=false;onBusy(false);if(!abort.signal.aborted)setBusy(false);}
 }
 return <section className="aw-capa" aria-label={t('İstisnalardan CAPA','CAPA from exceptions')} aria-busy={loading||busy}>
  <header><div><h4>{t('İstisnalardan CAPA','CAPA from exceptions')}</h4><p>{t('Onaylı istisnayı aksiyon planına dönüştürün. Kaynak örnek ve kanıt sürümü saklanır; CAPA açık durumda başlar.','Turn an approved exception into an action plan. The source sample and evidence version are retained; CAPA starts open.')}</p></div><button type="button" disabled={loading||busy} onClick={()=>void load()}>{t('CAPA bağlantılarını yenile','Refresh CAPA links')}</button></header>
  {loading&&<p role="status">{t('CAPA bağlantıları yükleniyor…','Loading CAPA links…')}</p>}
  {notice&&<p role="status">{t('CAPA oluşturuldu','CAPA created')}: {notice}</p>}
  {error&&<p role="alert">{messages[error]?.[tr?0:1]||t('Bağlantı doğrulanamadı. Plan korunuyor; yeniden oluşturmadan önce CAPA bağlantılarını yenileyin.','The connection could not be verified. Your plan is retained; refresh CAPA links before attempting creation again.')}</p>}
  {stale&&<p role="alert">{t('Çalışma kâğıdı değişti. Güncel kaydı yükleyip planınızı yeniden önizleyin.','The workpaper changed. Reload it and preview your plan again.')} <button type="button" disabled={busy} onClick={onReload}>{t('Çalışma kâğıdını yenile','Reload workpaper')}</button></p>}
  {data&&<>{(!data.complete||!data.peopleComplete)&&<p role="status">{t('En fazla 100 aktarım ve 1000 kişi gösterilir. Sınır nedeniyle liste eksik olabilir.','Up to 100 promotions and 1000 people are shown. The list may be incomplete at its limit.')}</p>}
   {paper.status!=='approved'&&<p>{t('Yeni aktarım için çalışma kâğıdının bağımsız incelemesi tamamlanmalıdır.','Independent workpaper review must be completed before a new promotion.')}</p>}
   {!exceptions.length&&<p>{t('Bu sürümde istisna sonucu yok.','This revision has no exception results.')}</p>}
   <ul className="aw-capa-links">{data.links.map(l=><li key={l.findingId}><b>{l.origin.sample.reference} · {l.code}</b><span>{l.missing?t('CAPA kaydı kullanılamıyor; kaynak izi korunuyor.','CAPA is unavailable; the origin is retained.'):findingLabel(l.status,lang)}</span><small>{t('Aktaran','Promoted by')}: {l.actor} · {l.createdAt}</small><details><summary>{t('Aktarım kaynağı ve gerekçesi','Promotion source and reason')}</summary><p>{l.origin.reason}</p><p>{l.origin.sample.note}</p><p>{t('Kaynak sürüm','Source revision')}: {l.sourceRevision}</p><p>{l.origin.evidence.title} · v{l.origin.evidence.versionNo} · {l.origin.evidence.id}</p><p>SHA-256: {l.origin.evidence.contentSha256}</p></details><button type="button" disabled={busy||l.missing} onClick={()=>navigateToFornost({module:'Bulgular ve CAPA',kind:'finding',ref:l.findingId,source:'audit-workpaper'})}>{t('CAPA kaydını aç','Open CAPA record')} · {l.code}</button></li>)}</ul>
   {data.canCreate&&!readOnly&&!draft&&exceptions.filter(s=>!data.links.some(l=>workpaperSampleKey(l.origin.sample.reference)===workpaperSampleKey(s.reference))).map(s=><button type="button" disabled={blocked||data.links.length>=100} key={s.reference} onClick={()=>open(s.reference)}>{t('CAPA oluştur','Create CAPA')} · {s.reference}</button>)}
   {data.links.length>=100&&<p>{t('Bu çalışma kâğıdı için 100 aktarım sınırına ulaşıldı.','This workpaper has reached its 100-promotion limit.')}</p>}
  </>}
  {draft&&currentLink&&<p role="status">{t('Bu örneğin CAPA bağlantısı bulundu; yukarıdaki kaydı açabilirsiniz.','This sample already has a CAPA link; open the record above.')} <button type="button" onClick={()=>{setDraft(null);setPreview('');}}>{t('Planı kapat','Close plan')}</button></p>}
  {draft&&!currentLink&&<form className="aw-capa-form" onSubmit={e=>{e.preventDefault();prepare();}}><h5>{t('İstisna','Exception')}: {draft.reference}</h5><fieldset disabled={blocked}><div className="aw-grid">
   {labels.map(([key,a,b,max])=><label key={key}>{t(a,b)}<textarea required aria-label={t(a,b)} maxLength={max} rows={3} value={draft.fields[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}
   <label>{t('Bulgu türü','Finding type')}<select aria-label={t('Bulgu türü','Finding type')} value={draft.fields.findingType} onChange={e=>patch({findingType:e.target.value})}>{FINDING_TYPES.map(v=><option key={v} value={v}>{findingLabel(v,lang)}</option>)}</select></label>
   <label>{t('Önem seviyesi','Severity')}<select aria-label={t('Önem seviyesi','Severity')} value={draft.fields.severity} onChange={e=>patch({severity:e.target.value})}>{FINDING_SEVERITIES.map(v=><option key={v} value={v}>{findingLabel(v,lang)}</option>)}</select></label>
   {(['owner','reviewer'] as const).map(key=><label key={key}>{key==='owner'?t('CAPA sorumlusu','CAPA owner'):t('Bağımsız Admin doğrulayıcı','Independent Admin reviewer')}<select required aria-label={key==='owner'?t('CAPA sorumlusu','CAPA owner'):t('Bağımsız Admin doğrulayıcı','Independent Admin reviewer')} value={draft.fields[key]} onChange={e=>patch({[key]:e.target.value})}><option value="">{t('Seçin','Select')}</option>{data?.people.filter(p=>key==='owner'||(p.role==='Admin'&&p.email!==data.actorEmail&&p.email!==draft.fields.owner)).map(p=><option key={p.email} value={p.email}>{p.name} · {p.email}</option>)}</select></label>)}
   <label>{t('CAPA termini','CAPA due date')}<input type="date" required aria-label={t('CAPA termini','CAPA due date')} value={draft.fields.dueDate} onChange={e=>patch({dueDate:e.target.value})}/><small>{t('Önem seviyesine göre en fazla','Maximum for this severity')}: {findingSlaDays(draft.fields.severity)} {t('gün','days')}</small></label>
   {(['riskRef','controlRef'] as const).map(key=><label key={key}>{key==='riskRef'?t('Risk referansı (isteğe bağlı)','Risk reference (optional)'):t('Kontrol referansı (isteğe bağlı)','Control reference (optional)')}<input maxLength={120} value={draft.fields[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}
   <label>{t('Aktarım gerekçesi','Promotion reason')}<textarea required minLength={3} maxLength={2000} value={draft.reason} onChange={e=>{setPreview('');setDraft({...draft,reason:e.target.value});}}/></label>
  </div><p>{t('CAPA kapanmadan önce risk veya kontrol bağlantısı ve bağımsız doğrulama gerekir. Kaynak kanıt, düzeltmenin tamamlandığını gösteren kanıt yerine geçmez.','CAPA requires a risk or control link and independent verification before closure. Source evidence does not replace evidence of completed remediation.')}</p><button type="submit" disabled={!currentSample}>{t('CAPA aktarımını önizle','Preview CAPA promotion')}</button></fieldset>
   {preview===stamp&&<section className="aw-capa-preview" aria-label={t('CAPA aktarım önizlemesi','CAPA promotion preview')}><h5>{t('Oluşturulacak kayıt','Record to create')}</h5><p>{data?.auditName} → {paper.title} → {draft.reference}</p><p>{t('Onaylı kaynak sürüm','Approved source revision')}: {paper.revision}</p><dl>{labels.map(([key,a,b])=><div key={key}><dt>{t(a,b)}</dt><dd>{draft.fields[key]}</dd></div>)}{(['findingType','severity','owner','reviewer','dueDate','riskRef','controlRef'] as const).map(key=><div key={key}><dt>{{findingType:t('Bulgu türü','Finding type'),severity:t('Önem seviyesi','Severity'),owner:t('Sorumlu','Owner'),reviewer:t('Doğrulayıcı','Reviewer'),dueDate:t('Termin','Due date'),riskRef:t('Risk','Risk'),controlRef:t('Kontrol','Control')}[key]}</dt><dd>{['findingType','severity'].includes(key)?findingLabel(draft.fields[key],lang):draft.fields[key]||'—'}</dd></div>)}</dl><p>{draft.reason}</p><p>{t('Sabitlenmiş kaynak kanıt','Pinned source evidence')}: {currentSample?.versionId}</p><p>SHA-256: {paper.evidence.find(e=>e.id===currentSample?.versionId)?.contentSha256}</p><button type="button" disabled={blocked} onClick={()=>void create()}>{t('Onayla ve CAPA oluştur','Confirm and create CAPA')}</button><button type="button" disabled={busy} onClick={()=>setPreview('')}>{t('Önizlemeyi iptal et','Cancel preview')}</button></section>}
   <button type="button" disabled={busy} onClick={()=>{setDraft(null);setPreview('');setError('');}}>{t('Aktarımdan vazgeç','Cancel promotion')}</button>
  </form>}
 </section>;
}

export function WorkpaperCapaOriginPanel({findingId,tr,close}:{findingId:string;tr:boolean;close:()=>void}){
 const [data,setData]=useState<{link:WorkpaperCapaLink|null;sourceAvailable:boolean}|null>(null),[error,setError]=useState(false),[nonce,setNonce]=useState(0);
 useEffect(()=>{const abort=new AbortController();let current=true;fetch(withBasePath(`${endpoint}?findingId=${encodeURIComponent(findingId)}`),{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error('unavailable');if(current){setData(body);setError(false);}}).catch(()=>{if(current){setData(null);setError(true);}});return()=>{current=false;abort.abort();};},[findingId,nonce]);
 if(error)return <section className="aw-capa-origin" role="alert"><p>{tr?'Çalışma kâğıdı kaynağı alınamadı.':'Workpaper origin could not be loaded.'}</p><button type="button" onClick={()=>setNonce(n=>n+1)}>{tr?'Kaynağı yeniden yükle':'Retry source'}</button></section>;
 if(!data?.link)return null;
 const {origin,sourceRevision,actor,createdAt}=data.link;
 return <section className="aw-capa-origin" aria-label={tr?'Çalışma kâğıdı kaynağı':'Workpaper origin'}><h4>{tr?'Çalışma kâğıdından aktarılan istisna':'Exception promoted from a workpaper'}</h4><p>{origin.auditName} → {origin.workpaperTitle} → {origin.sample.reference}</p><p>{origin.sample.note}</p><p>{origin.reason}</p><p>{tr?'Onaylı kaynak sürüm':'Approved source revision'}: {sourceRevision}</p><p>{origin.evidence.title} · v{origin.evidence.versionNo} · {origin.evidence.id}</p><p>SHA-256: {origin.evidence.contentSha256}</p><p>{actor} · {createdAt}</p><p>{tr?'Bu kaynak izi aktarıldığı haliyle korunur. CAPA kapanışı ayrıca doğrulanır.':'This origin remains as promoted. CAPA closure is verified separately.'}</p>{data.sourceAvailable?<button type="button" onClick={()=>{close();navigateToFornost({module:'Denetim Yönetimi',kind:'audit-workpaper',ref:origin.workpaperId,filter:{auditId:origin.auditId},source:'workpaper-capa'});}}>{tr?'Kaynak çalışma kâğıdını aç':'Open source workpaper'}</button>:<p>{tr?'Kaynak denetim artık kullanılamıyor; aktarım kaydı korunuyor.':'The source audit is no longer available; the promotion record is retained.'}</p>}</section>;
}
