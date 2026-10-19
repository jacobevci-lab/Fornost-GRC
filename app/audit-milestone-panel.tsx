"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {emptyMilestone,milestoneLabels,type AuditMilestone,type MilestoneFields} from './audit-milestones';
import {requestDueAt} from './audit-requests';
import './audit-milestone-panel.css';
type State={milestones:AuditMilestone[];complete:boolean;people:{email:string;name:string}[];peopleComplete:boolean;actorEmail:string;admin:boolean;canManage:boolean;history:{id:string;actor:string;action:string;note:string;snapshot_json:string;created_at:string}[];historyComplete:boolean};
export function AuditMilestonePanel(props:{auditId:string;lang:string;canWrite:boolean;focusId?:string}){
 return <Milestones key={`${props.auditId}:${props.focusId||''}`} {...props}/>;
}
function Milestones({auditId,lang,canWrite,focusId=''}:{auditId:string;lang:string;canWrite:boolean;focusId?:string}){
 const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b,formId=useId();
 const[state,setState]=useState<State|null>(null),[selected,setSelected]=useState(focusId),[focus,setFocus]=useState(focusId),[draft,setDraft]=useState<MilestoneFields>({...emptyMilestone}),[revision,setRevision]=useState(''),[note,setNote]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0),[clock,setClock]=useState(()=>Date.now());
 const newId=useRef(`AMT-${crypto.randomUUID()}`);
 const flight=useRef(false),current=state?.milestones.find(m=>m.id===selected),editable=canWrite&&state?.canManage&&(!current||state.admin||current.owner===state.actorEmail),terminal=current&&['completed','cancelled'].includes(current.status);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{let live=true;const controller=new AbortController();void(async()=>{try{
  const res=await fetch(withBasePath(`/api/audits/milestones?auditId=${encodeURIComponent(auditId)}${selected?`&id=${encodeURIComponent(selected)}`:''}`),{cache:'no-store',signal:controller.signal}),body=await res.json();
  if(!res.ok||!Array.isArray(body.milestones)||typeof body.complete!=='boolean'||!Array.isArray(body.people))throw new Error('load');
  if(live){setState(body);const row=body.milestones.find((m:AuditMilestone)=>m.id===selected);setDraft(row?{title:row.title,description:row.description,owner:row.owner,dueDate:row.dueDate,timeZone:row.timeZone}:{...emptyMilestone,owner:body.actorEmail,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'});setRevision(row?.revision||'');setDirty(false);setNote('');setError('');}
 }catch{if(live)setError('load');}finally{if(live)setLoading(false);}})();return()=>{live=false;controller.abort();};},[auditId,selected,refresh]);
 const messages:Record<string,[string,string]>={load:['Görevler yüklenemedi. Görünen eski veriyi güncel saymayın; yeniden deneyin.','Milestones could not be loaded. Previous data is unverified; retry.'],conflict:['Kayıt veya atama değişmiş olabilir. Taslağınız korundu; güncel kaydı yeniden yükleyip inceleyin.','The record or assignment may have changed. Your draft is retained; reload and review.'],owner:['Yalnız sorumlu veya yönetici bu işlemi yapabilir.','Only the owner or an administrator can perform this action.'],assignee:['Sorumlu ve işlemi yapan hesap aktif ve denetim yazma yetkili olmalı.','The owner and acting account must be active audit writers.'],fields:['Başlık, sorumlu ve alanları kontrol edin.','Check title, owner and fields.'],dates:['Geçerli hedef tarih girin.','Enter a valid due date.'],timezone:['Geçerli IANA saat dilimi girin.','Enter a valid IANA time zone.'],note:['İşlem gerekçesi en az 3 karakter olmalı.','Enter a reason of at least 3 characters.'],transition:['Bu işlem mevcut durumda kullanılamaz.','This action is unavailable in the current state.'],'audit-closed':['Denetim kapalı. Önce gerekçeyle yeniden açılmalı.','The audit is closed. Reopen it with a reason first.'],unavailable:['İşlem doğrulanamadı. Taslak korundu; yeniden yükleyip sonucu kontrol edin.','The operation could not be confirmed. Draft retained; reload and check its result.']};
 function discard(){return !dirty||window.confirm(t('Kaydedilmemiş değişiklikler bırakılsın mı?','Discard unsaved changes?'));}
 function select(id:string){if(busy||!discard())return;setNotice('');if(!id)newId.current=`AMT-${crypto.randomUUID()}`;setSelected(id);setLoading(true);setRefresh(x=>x+1);}
 async function act(action:string){
  if(flight.current||loading||!state?.complete||error==='load')return;flight.current=true;setBusy(true);setError('');setNotice('');
  const id=selected||newId.current;
  try{const response=await fetch(withBasePath('/api/audits/milestones'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({auditId,id,action,expectedRevision:revision,fields:draft,note})}),body=await response.json();if(!response.ok)throw new Error(body.error||'unavailable');setDirty(false);setSelected(id);setNotice(t('Görev kaydedildi.','Milestone saved.'));setLoading(true);setRefresh(x=>x+1);}
  catch(err){setError(err instanceof Error?err.message:'unavailable');}finally{flight.current=false;setBusy(false);}
 }
 const rows=focus?state?.milestones.filter(m=>m.id===focus):state?.milestones;
 const patch=(key:keyof MilestoneFields,value:string)=>{setDraft(d=>({...d,[key]:value}));setDirty(true);};
 const fieldsChanged=!!current&&Object.keys(emptyMilestone).some(key=>draft[key as keyof MilestoneFields]!==current[key as keyof MilestoneFields]);
 const unavailable=loading||busy||!state?.complete||error==='load';
 return <section className="audit-milestones" aria-label={t('Denetim görevleri','Audit milestones')} aria-busy={loading||busy}>
  <header><div><h3>{t('Görevler ve kilometre taşları','Tasks and milestones')}</h3><p>{t('Sorumlu ve tarih atayın; iş Benim İşlerim içinde takip edilir. Plan notlarından otomatik görev veya e-posta üretilmez.','Assign an owner and due date; follow the task in My Work. Plan notes do not automatically create tasks or email.')}</p></div><button type="button" disabled={busy} onClick={()=>{if(discard()){setError('');setLoading(true);setRefresh(x=>x+1);}}}>{t('Yeniden yükle','Reload')}</button></header>
  {error&&<p role="alert">{(messages[error]||messages.unavailable)[tr?0:1]}</p>}{notice&&<p role="status">{notice}</p>}
  {loading&&<p role="status">{t('Yükleniyor…','Loading…')}</p>}
  {state&&!state.complete&&<p role="alert">{t('Görev listesi eksik; yazma işlemleri kapalı.','The milestone list is incomplete; writes are disabled.')}</p>}
  {focus&&<div className="core-record-focus" role="status"><span>{t('Seçili görev','Selected milestone')}: {focus}{!loading&&!rows?.length?' · '+t('Kayıt bulunamadı veya erişilemiyor.','Record unavailable or inaccessible.'):''}</span><button type="button" disabled={busy} onClick={()=>{if(!busy&&discard()){setFocus('');newId.current=`AMT-${crypto.randomUUID()}`;setSelected('');setLoading(true);setRefresh(x=>x+1);}}}>{t('Tüm görevleri göster','Show all milestones')}</button></div>}
  <div className="am-layout"><div className="am-list">
   {!loading&&state&&!rows?.length&&!focus&&<p>{t('Henüz tarihli görev yok. Eski kilometre taşı notları yukarıdaki planda korunur.','No scheduled milestones yet. Existing milestone notes remain in the plan above.')}</p>}
   {rows?.map(row=><button type="button" key={row.id} aria-pressed={selected===row.id} disabled={busy} onClick={()=>select(row.id)}><b>{row.title}</b><span>{milestoneLabels[row.status][tr?0:1]} · {row.owner}</span><span>{row.dueDate} · {row.timeZone}{!['completed','cancelled'].includes(row.status)&&Date.parse(requestDueAt(row.dueDate,row.timeZone))<clock?' · '+t('Gecikmiş','Overdue'):''}</span></button>)}
   {canWrite&&state?.canManage&&<button type="button" disabled={unavailable||state.milestones.length>=100} onClick={()=>{if(!busy&&discard()){setFocus('');newId.current=`AMT-${crypto.randomUUID()}`;setSelected('');setLoading(true);setRefresh(x=>x+1);}}}>{t('Yeni görev','New milestone')}</button>}
   {state&&<small>{state.milestones.length}/100 · {t('İptal edilenler sınırda tutulur.','Cancelled milestones count toward the limit.')}</small>}
  </div><div className="am-detail">
   {(!focus||current)&&state&&<><fieldset disabled={unavailable||!editable||!!terminal}><legend>{current?t('Görev detayı','Milestone details'):t('Yeni görev','New milestone')}</legend>
    <label>{t('Görev başlığı','Milestone title')}<input aria-label={t('Görev başlığı','Milestone title')} value={draft.title} maxLength={200} onChange={e=>patch('title',e.target.value)}/></label>
    <label>{t('Açıklama ve beklenen çıktı','Description and expected output')}<textarea aria-label={t('Açıklama ve beklenen çıktı','Description and expected output')} value={draft.description} maxLength={2000} onChange={e=>patch('description',e.target.value)}/></label>
    <label>{t('Sorumlu','Owner')}<select aria-label={t('Sorumlu','Owner')} value={draft.owner} disabled={!state.admin} onChange={e=>patch('owner',e.target.value)}><option value="">{t('Seçin','Select')}</option>{draft.owner&&!state.people.some(p=>p.email===draft.owner)&&<option value={draft.owner}>{draft.owner}</option>}{state.people.map(p=><option key={p.email} value={p.email}>{p.name} · {p.email}</option>)}</select></label>
    <div className="am-dates"><label>{t('Hedef tarih','Due date')}<input aria-label={t('Hedef tarih','Due date')} type="date" value={draft.dueDate} onChange={e=>patch('dueDate',e.target.value)}/></label><label>{t('Saat dilimi (IANA)','Time zone (IANA)')}<input aria-label={t('Saat dilimi (IANA)','Time zone (IANA)')} value={draft.timeZone} maxLength={80} placeholder="Europe/Istanbul" onChange={e=>patch('timeZone',e.target.value)}/></label></div>
   </fieldset>
   {!state.peopleComplete&&<p role="status">{t('Kullanıcı listesi kısmi. Listelenen uygun hesapları seçebilirsiniz.','The user list is partial. You can select listed eligible accounts.')}</p>}
   {editable&&<><label htmlFor={`${formId}-note`}>{t('İşlem / tamamlama gerekçesi','Action / completion reason')}</label><textarea id={`${formId}-note`} disabled={unavailable} value={note} maxLength={2000} onChange={e=>{setNote(e.target.value);setDirty(true);}}/>
    <div className="am-actions">{!terminal&&<button type="button" disabled={unavailable} onClick={()=>void act('save')}>{t('Görevi kaydet','Save milestone')}</button>}{current&&!fieldsChanged&&<>{current.status==='planned'&&<button type="button" disabled={unavailable} onClick={()=>void act('start')}>{t('Başlat','Start')}</button>}</>}
    {current&&<>{!terminal?<><button type="button" disabled={unavailable||fieldsChanged} onClick={()=>void act('complete')}>{t('Tamamla','Complete')}</button><button type="button" disabled={unavailable||fieldsChanged} onClick={()=>void act('cancel')}>{t('İptal et','Cancel milestone')}</button></>:<button type="button" disabled={unavailable} onClick={()=>void act('reopen')}>{t('Yeniden aç','Reopen')}</button>}</>}
    </div></>}
   {current&&<p>{t('Son gerekçe','Latest reason')}: {current.note||'—'}</p>}
   {selected&&<details><summary>{t('Değişiklik geçmişi','Change history')} ({state.history.length})</summary>{!state.historyComplete&&<p>{t('Son 100 olay gösteriliyor.','Showing the latest 100 events.')}</p>}<ol>{state.history.map(event=><li key={event.id}><b>{({save:t('Kaydedildi','Saved'),start:t('Başlatıldı','Started'),complete:t('Tamamlandı','Completed'),cancel:t('İptal edildi','Cancelled'),reopen:t('Yeniden açıldı','Reopened')} as Record<string,string>)[event.action]||event.action}</b> · {event.created_at} · {event.actor}<p>{event.note}</p><details><summary>{t('Kaydedilmiş görev','Saved milestone')}</summary><MilestoneSnapshot value={event.snapshot_json} tr={tr}/></details></li>)}</ol></details>}
   </>}
  </div></div>
 </section>;
}

function MilestoneSnapshot({value,tr}:{value:string;tr:boolean}){
 let row:AuditMilestone|null=null;try{row=JSON.parse(value) as AuditMilestone;}catch{}
 if(!row)return <p>{tr?'Geçmiş okunamadı.':'History unavailable.'}</p>;
 return <dl><dt>{tr?'Başlık':'Title'}</dt><dd>{row.title}</dd><dt>{tr?'Sorumlu':'Owner'}</dt><dd>{row.owner}</dd><dt>{tr?'Hedef tarih':'Due date'}</dt><dd>{row.dueDate} · {row.timeZone}</dd><dt>{tr?'Durum':'Status'}</dt><dd>{milestoneLabels[row.status]?.[tr?0:1]||row.status}</dd><dt>{tr?'Açıklama':'Description'}</dt><dd>{row.description||'—'}</dd></dl>;
}
