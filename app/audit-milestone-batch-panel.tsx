'use client';
import {useRef,useState} from 'react';
import {builtInDraftTemplates} from './audit-draft-templates';
import {validateMilestoneBatch,type MilestoneBatchItem} from './audit-milestone-batch';
import {withBasePath} from './base-path';
import './audit-template-panel.css';
import {AuditTemplateLibrary} from './audit-template-library';
import {BatchDeadlinePlanner} from './audit-milestone-batch-deadline-panel';
import type {BatchDeadlineAdjustmentInput} from './audit-milestone-batch-deadlines';
import type {SavedAuditReminderProfile} from './audit-reminder-profile';
import type {TaskPackTemplate} from './audit-shared-templates';

type Draft = {key:string;selected:boolean;title:string;description:string;dueDate:string};
export function AuditMilestoneBatchPanel({auditId,tr,actorEmail,admin,people,count,savedCalendar,disabled,onBusy,onSaved}: {auditId:string;tr:boolean;actorEmail:string;admin:boolean;people:{email:string;name:string}[];count:number;savedCalendar?:SavedAuditReminderProfile;disabled:boolean;onBusy:(busy:boolean)=>void;onSaved:(ids:string[])=>void}) {
 const t=(a:string,b:string)=>tr?a:b;
 const [drafts,setDrafts]=useState<Draft[]>([]),[owner,setOwner]=useState(actorEmail),[zone,setZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),[chain,setChain]=useState(true),[preview,setPreview]=useState<MilestoneBatchItem[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const flight=useRef(false);
 const [adjustment,setAdjustment]=useState<BatchDeadlineAdjustmentInput|null>(null);
 const [calendarOverride,setCalendarOverride]=useState<{baseRevision:string|undefined;saved:SavedAuditReminderProfile}|null>(null);
 const calendar=calendarOverride&&calendarOverride.baseRevision===savedCalendar?.revision?calendarOverride.saved:savedCalendar;
 function undoDates(){if(adjustment)setDrafts(rows=>rows.map(row=>({...row,dueDate:adjustment.dates.find(date=>date.id===row.key)?.dueDate||row.dueDate})));setAdjustment(null);change();}
 async function refreshCalendar(){
  if(flight.current||disabled)return;flight.current=true;setBusy(true);onBusy(true);
  try{const response=await fetch(withBasePath(`/api/audits/milestones?auditId=${encodeURIComponent(auditId)}`),{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await response.json();if(!response.ok||!body.reminderProfile)throw Error('load');setCalendarOverride({baseRevision:savedCalendar?.revision,saved:body.reminderProfile});undoDates();}
  catch{setError('calendar-load');}finally{flight.current=false;setBusy(false);onBusy(false);}
 }
 const [sharedPreview,setSharedPreview]=useState<TaskPackTemplate|null>(null);
 function change(){setPreview(null);setError('');setSaved(false);}
 function start(){change();setAdjustment(null);setDrafts(builtInDraftTemplates('milestone',tr).map(item=>({key:`AMT-${crypto.randomUUID()}`,selected:true,title:item.fields.title,description:item.fields.description,dueDate:''})));}
 function patch(key:string,values:Partial<Draft>){change();setDrafts(rows=>rows.map(row=>row.key===key?{...row,...values}:row));}
 function move(index:number,offset:number){change();setDrafts(rows=>{const next=[...rows];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});}
 function review(){
  try {const selected=drafts.filter(row=>row.selected);if(count+selected.length>100)throw Error('limit');
   const ids=selected.map(row=>row.key);
   setPreview(validateMilestoneBatch(selected.map((row,index)=>({id:ids[index],fields:{title:row.title,description:row.description,owner,dueDate:row.dueDate,timeZone:zone,dependsOn:chain&&index?[ids[index-1]]:[]}}))));setError('');
  }catch(e){setPreview(null);setError(e instanceof Error?e.message:'fields');}
 }
 async function save(){
  if(flight.current||disabled||!preview)return;flight.current=true;setBusy(true);onBusy(true);setError('');
  try {const response=await fetch(withBasePath('/api/audits/milestones'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({auditId,action:'create-batch',...(adjustment?{deadlineAdjustment:adjustment}:{}),items:preview.map(item=>({...item,fields:{title:item.fields.title,description:item.fields.description,owner:item.fields.owner,dueDate:item.fields.dueDate,timeZone:item.fields.timeZone,dependsOn:item.fields.dependsOn}}))})});const body=await response.json();if(!response.ok)throw Error(body.error||'unavailable');if(!Array.isArray(body.ids)||body.ids.length!==preview.length)throw Error('unavailable');setDrafts([]);setAdjustment(null);setPreview(null);setSaved(true);onSaved(body.ids);
  }catch(e){setError(e instanceof Error?e.message:'unavailable');}finally{flight.current=false;setBusy(false);onBusy(false);}
 }
 return <details className="audit-template-panel am-batch"><summary>{t('Görev paketi oluştur','Create task pack')}</summary>
  <p>{t('Başlangıç görevlerini seçin, metinleri ve her görevin hedef tarihini düzenleyin. Önizleme kayıt oluşturmaz. Kaydettiğinizde tüm seçili görevler birlikte oluşturulur.','Select starter tasks, edit their text and set each due date. Preview creates no records. Saving creates all selected tasks together.')}</p>
  <AuditTemplateLibrary kind="task-pack" tr={tr} source={drafts.some(row=>row.selected)?{version:1,kind:'task-pack',name:'Draft',chain,tasks:drafts.filter(row=>row.selected).map(({title,description})=>({title,description}))}:null} disabled={disabled||busy||!!adjustment} onChoose={template=>{if(template.kind==='task-pack'){setSharedPreview(template);change();}}}/>
  {sharedPreview&&<fieldset disabled={disabled||busy}><legend>{t('Ortak görev paketi önizlemesi','Shared task pack preview')}: {sharedPreview.name}</legend><ol>{sharedPreview.tasks.map((row,i)=><li key={i}><b>{row.title}</b><p>{row.description}</p></li>)}</ol><p>{t('Uygulandığında mevcut paket taslağı değiştirilir. Sorumlu ve saat dilimi korunur; her görevin tarihini yeniden seçmelisiniz.','Applying replaces the current pack draft. Owner and time zone are preserved; select each task due date again.')}</p><button type="button" onClick={()=>{change();setAdjustment(null);setDrafts(sharedPreview.tasks.map(row=>({...row,key:`AMT-${crypto.randomUUID()}`,selected:true,dueDate:''})));setChain(sharedPreview.chain);setSharedPreview(null);}}>{t('Ortak paketi taslağa uygula','Apply shared pack to draft')}</button><button type="button" onClick={()=>setSharedPreview(null)}>{t('Ortak paket önizlemesini kapat','Close shared pack preview')}</button></fieldset>}
  <fieldset disabled={disabled||busy}><legend>{t('Paket taslağı','Task pack draft')}</legend>
   <button type="button" disabled={!!adjustment} onClick={()=>{if(!drafts.length||window.confirm(t('Paket taslağı başlangıç metinleriyle değiştirilsin mi?','Replace the task pack draft with starter text?')))start();}}>{t('Denetim başlangıç paketini hazırla','Prepare audit starter pack')}</button>
   {!!drafts.length&&<>
    <label>{t('Paket sorumlusu','Pack owner')}<select aria-label={t('Paket sorumlusu','Pack owner')} value={owner} disabled={!admin} onChange={e=>{change();setOwner(e.target.value);}}>{!people.some(p=>p.email===owner)&&<option value={owner}>{owner}</option>}{people.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}</select></label>
    <label>{t('Paket saat dilimi','Pack time zone')}<input aria-label={t('Paket saat dilimi','Pack time zone')} value={zone} maxLength={80} disabled={!!adjustment} onChange={e=>{change();setZone(e.target.value);}}/></label>
    <label><input type="checkbox" checked={chain} onChange={e=>{change();setChain(e.target.checked);}}/>{t('Seçili görevleri sırayla birbirine bağla','Link selected tasks in sequence')}</label>
    <p>{t('Sıralama seçilirse her görev, önceki seçili görev tamamlanınca başlayabilir. Tarihler otomatik hesaplanmaz. E-posta hatırlatmaları ve tekrar kapalı oluşturulur.','When linked, each task can start after the previous selected task is completed. Dates are not calculated automatically. Email reminders and recurrence start disabled.')}</p>
    {drafts.map((row,index)=><fieldset key={row.key}><legend>{t('Görev','Task')} {index+1}</legend>
     <label><input type="checkbox" checked={row.selected} disabled={!!adjustment} onChange={e=>patch(row.key,{selected:e.target.checked})}/>{t('Pakete dahil et','Include in pack')} {index+1}</label>
     <label>{t('Başlık','Title')}<input aria-label={`${t('Paket görev başlığı','Pack task title')} ${index+1}`} value={row.title} maxLength={200} disabled={!row.selected} onChange={e=>patch(row.key,{title:e.target.value})}/></label>
     <label>{t('Açıklama','Description')}<textarea aria-label={`${t('Paket görev açıklaması','Pack task description')} ${index+1}`} value={row.description} maxLength={2000} disabled={!row.selected} onChange={e=>patch(row.key,{description:e.target.value})}/></label>
     <label>{t('Hedef tarih','Due date')}<input aria-label={`${t('Paket hedef tarih','Pack due date')} ${index+1}`} type="date" value={row.dueDate} disabled={!row.selected||!!adjustment} onChange={e=>patch(row.key,{dueDate:e.target.value})}/></label>
     <div className="at-actions"><button type="button" aria-label={`${t('Görevi yukarı taşı','Move task up')} ${index+1}`} disabled={index===0||!!adjustment} onClick={()=>move(index,-1)}>{t('Yukarı taşı','Move up')}</button><button type="button" aria-label={`${t('Görevi aşağı taşı','Move task down')} ${index+1}`} disabled={index===drafts.length-1||!!adjustment} onClick={()=>move(index,1)}>{t('Aşağı taşı','Move down')}</button><button type="button" aria-label={`${t('Paket taslağından çıkar','Remove from pack draft')} ${index+1}`} disabled={!!adjustment} onClick={()=>{change();setDrafts(rows=>rows.filter(item=>item.key!==row.key));}}>{t('Taslak görevini çıkar','Remove draft task')}</button></div>
    </fieldset>)}
    <button type="button" disabled={drafts.length>=12||!!adjustment} onClick={()=>{change();setDrafts(rows=>[...rows,{key:`AMT-${crypto.randomUUID()}`,selected:true,title:'',description:'',dueDate:''}]);}}>{t('Pakete görev ekle','Add task to pack')}</button>
    <p>{drafts.filter(row=>row.selected).length} {t('yeni görev','new tasks')} · {count}/100 {t('mevcut','existing')}</p>
    {!adjustment&&<BatchDeadlinePlanner tr={tr} saved={calendar} tasks={drafts.filter(row=>row.selected).map(row=>({id:row.key,title:row.title,dueDate:row.dueDate}))} timeZone={zone} disabled={disabled||busy} onApply={(dates,input)=>{change();setDrafts(rows=>rows.map(row=>({...row,dueDate:dates.find(date=>date.id===row.key)?.dueDate||row.dueDate})));setAdjustment(input);setSharedPreview(null);}}/>}
    {adjustment&&<div className="audit-deadline-adjustment" role="status"><b>{t('Paket iş günü tarihleri taslağa uygulandı.','Working-day dates applied to the task pack draft.')}</b><p>{adjustment.reason}</p><p>{t('Takvim sürümü','Calendar revision')}: {adjustment.profileRevision}</p><p>{t('Tarih, saat dilimi veya görev seçimini değiştirmek için öneriyi geri alın. Başlık, açıklama ve sorumlu düzenlenebilir.','Undo the proposal to change dates, time zone or task selection. Titles, descriptions and owner remain editable.')}</p><button type="button" onClick={undoDates}>{t('Paket tarih önerisini geri al','Undo proposed pack dates')}</button></div>}
    <button type="button" onClick={()=>void refreshCalendar()}>{adjustment?t('Takvimi yenile ve tarih önerisini geri al','Refresh calendar and undo proposed dates'):t('Paket takvimini yenile','Refresh pack calendar')}</button>
    <button type="button" onClick={review}>{t('Görev paketini önizle','Preview task pack')}</button>
    <button type="button" onClick={()=>{setDrafts([]);setAdjustment(null);change();}}>{t('Paket taslağını bırak','Discard task pack draft')}</button>
   </>}
  </fieldset>
  {error&&<p role="alert">{error==='deadline-calendar-conflict'?t('Takvim değişti; hiçbir görev kaydedilmedi. Taslak korundu. Takvimi yenileyip tarihleri yeniden önizleyin.','The calendar changed; no tasks were saved. Draft retained. Refresh the calendar and preview the dates again.'):error==='calendar-load'?t('Takvim yüklenemedi. Taslak ve tarih önerisi korundu; tekrar deneyin.','Calendar could not be loaded. Draft and date proposal retained; retry.'):error==='deadline-adjustment'?t('Tarih önerisi paketle eşleşmiyor. Öneriyi geri alıp yeniden önizleyin.','The date proposal does not match the pack. Undo and preview again.'):error==='limit'?t('Denetim başına 100 görev sınırı aşılır. Daha az görev seçin.','The audit limit of 100 tasks would be exceeded. Select fewer tasks.'):['fields','dates','timezone'].includes(error)?t('Seçili görevlerin başlık, sorumlu, tarih ve saat dilimini kontrol edin.','Check selected task titles, owner, dates and time zone.'):t('Paket kaydı doğrulanamadı; taslak korundu. Yeniden yükleyip görev listesini kontrol edin. Yetki, denetim durumu veya kayıtlar değişmiş olabilir.','The pack save could not be confirmed; draft retained. Reload and check the task list. Permissions, audit state or records may have changed.')}</p>}
  {saved&&<p role="status">{t('Görev paketi kaydedildi. Görevleri listeden ve Benim İşlerim ekranından takip edebilirsiniz.','Task pack saved. Follow the tasks in the list and My Work.')}</p>}
  {preview&&<fieldset disabled={disabled||busy}><legend>{t('Kaydedilecek görevler','Tasks to create')}</legend><ol>{preview.map((item,index)=><li key={item.id}><b>{item.fields.title}</b><p>{item.fields.description}</p><p>{item.fields.owner} · {item.fields.dueDate} · {item.fields.timeZone}</p><p>{t('Ön koşul','Prerequisite')}: {item.fields.dependsOn?.length?preview[index-1].fields.title:'—'}</p></li>)}</ol><button type="button" onClick={()=>void save()}>{busy?t('Kaydediliyor…','Saving…'):t('Tüm görevleri kaydet','Save all tasks')}</button><button type="button" onClick={()=>setPreview(null)}>{t('Önizlemeyi kapat','Close preview')}</button></fieldset>}
 </details>;
}
