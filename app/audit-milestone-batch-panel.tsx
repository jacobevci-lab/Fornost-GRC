'use client';
import {useRef,useState} from 'react';
import {builtInDraftTemplates} from './audit-draft-templates';
import {validateMilestoneBatch,type MilestoneBatchItem} from './audit-milestone-batch';
import {withBasePath} from './base-path';
import './audit-template-panel.css';

type Draft = {key:number;selected:boolean;title:string;description:string;dueDate:string};
export function AuditMilestoneBatchPanel({auditId,tr,actorEmail,admin,people,count,disabled,onBusy,onSaved}: {auditId:string;tr:boolean;actorEmail:string;admin:boolean;people:{email:string;name:string}[];count:number;disabled:boolean;onBusy:(busy:boolean)=>void;onSaved:(ids:string[])=>void}) {
 const t=(a:string,b:string)=>tr?a:b;
 const [drafts,setDrafts]=useState<Draft[]>([]),[owner,setOwner]=useState(actorEmail),[zone,setZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),[chain,setChain]=useState(true),[preview,setPreview]=useState<MilestoneBatchItem[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const flight=useRef(false);
 function change(){setPreview(null);setError('');setSaved(false);}
 function start(){change();setDrafts(builtInDraftTemplates('milestone',tr).map((item,key)=>({key,selected:true,title:item.fields.title,description:item.fields.description,dueDate:''})));}
 function patch(key:number,values:Partial<Draft>){change();setDrafts(rows=>rows.map(row=>row.key===key?{...row,...values}:row));}
 function review(){
  try {const selected=drafts.filter(row=>row.selected);if(count+selected.length>100)throw Error('limit');
   const ids=selected.map(()=>`AMT-${crypto.randomUUID()}`);
   setPreview(validateMilestoneBatch(selected.map((row,index)=>({id:ids[index],fields:{title:row.title,description:row.description,owner,dueDate:row.dueDate,timeZone:zone,dependsOn:chain&&index?[ids[index-1]]:[]}}))));setError('');
  }catch(e){setPreview(null);setError(e instanceof Error?e.message:'fields');}
 }
 async function save(){
  if(flight.current||disabled||!preview)return;flight.current=true;setBusy(true);onBusy(true);setError('');
  try {const response=await fetch(withBasePath('/api/audits/milestones'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({auditId,action:'create-batch',items:preview.map(item=>({...item,fields:{title:item.fields.title,description:item.fields.description,owner:item.fields.owner,dueDate:item.fields.dueDate,timeZone:item.fields.timeZone,dependsOn:item.fields.dependsOn}}))})});const body=await response.json();if(!response.ok)throw Error(body.error||'unavailable');if(!Array.isArray(body.ids)||body.ids.length!==preview.length)throw Error('unavailable');setDrafts([]);setPreview(null);setSaved(true);onSaved(body.ids);
  }catch(e){setError(e instanceof Error?e.message:'unavailable');}finally{flight.current=false;setBusy(false);onBusy(false);}
 }
 return <details className="audit-template-panel am-batch"><summary>{t('Görev paketi oluştur','Create task pack')}</summary>
  <p>{t('Başlangıç görevlerini seçin, metinleri ve her görevin hedef tarihini düzenleyin. Önizleme kayıt oluşturmaz. Kaydettiğinizde tüm seçili görevler birlikte oluşturulur.','Select starter tasks, edit their text and set each due date. Preview creates no records. Saving creates all selected tasks together.')}</p>
  <fieldset disabled={disabled||busy}><legend>{t('Paket taslağı','Task pack draft')}</legend>
   <button type="button" onClick={()=>{if(!drafts.length||window.confirm(t('Paket taslağı başlangıç metinleriyle değiştirilsin mi?','Replace the task pack draft with starter text?')))start();}}>{t('Denetim başlangıç paketini hazırla','Prepare audit starter pack')}</button>
   {!!drafts.length&&<>
    <label>{t('Paket sorumlusu','Pack owner')}<select aria-label={t('Paket sorumlusu','Pack owner')} value={owner} disabled={!admin} onChange={e=>{change();setOwner(e.target.value);}}>{!people.some(p=>p.email===owner)&&<option value={owner}>{owner}</option>}{people.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}</select></label>
    <label>{t('Paket saat dilimi','Pack time zone')}<input aria-label={t('Paket saat dilimi','Pack time zone')} value={zone} maxLength={80} onChange={e=>{change();setZone(e.target.value);}}/></label>
    <label><input type="checkbox" checked={chain} onChange={e=>{change();setChain(e.target.checked);}}/>{t('Seçili görevleri sırayla birbirine bağla','Link selected tasks in sequence')}</label>
    <p>{t('Sıralama seçilirse her görev, önceki seçili görev tamamlanınca başlayabilir. Tarihler otomatik hesaplanmaz. E-posta hatırlatmaları ve tekrar kapalı oluşturulur.','When linked, each task can start after the previous selected task is completed. Dates are not calculated automatically. Email reminders and recurrence start disabled.')}</p>
    {drafts.map((row,index)=><fieldset key={row.key}><legend>{t('Görev','Task')} {index+1}</legend>
     <label><input type="checkbox" checked={row.selected} onChange={e=>patch(row.key,{selected:e.target.checked})}/>{t('Pakete dahil et','Include in pack')} {index+1}</label>
     <label>{t('Başlık','Title')}<input aria-label={`${t('Paket görev başlığı','Pack task title')} ${index+1}`} value={row.title} maxLength={200} disabled={!row.selected} onChange={e=>patch(row.key,{title:e.target.value})}/></label>
     <label>{t('Açıklama','Description')}<textarea aria-label={`${t('Paket görev açıklaması','Pack task description')} ${index+1}`} value={row.description} maxLength={2000} disabled={!row.selected} onChange={e=>patch(row.key,{description:e.target.value})}/></label>
     <label>{t('Hedef tarih','Due date')}<input aria-label={`${t('Paket hedef tarih','Pack due date')} ${index+1}`} type="date" value={row.dueDate} disabled={!row.selected} onChange={e=>patch(row.key,{dueDate:e.target.value})}/></label>
    </fieldset>)}
    <p>{drafts.filter(row=>row.selected).length} {t('yeni görev','new tasks')} · {count}/100 {t('mevcut','existing')}</p>
    <button type="button" onClick={review}>{t('Görev paketini önizle','Preview task pack')}</button>
    <button type="button" onClick={()=>{setDrafts([]);change();}}>{t('Paket taslağını bırak','Discard task pack draft')}</button>
   </>}
  </fieldset>
  {error&&<p role="alert">{error==='limit'?t('Denetim başına 100 görev sınırı aşılır. Daha az görev seçin.','The audit limit of 100 tasks would be exceeded. Select fewer tasks.'):['fields','dates','timezone'].includes(error)?t('Seçili görevlerin başlık, sorumlu, tarih ve saat dilimini kontrol edin.','Check selected task titles, owner, dates and time zone.'):t('Paket kaydı doğrulanamadı; taslak korundu. Yeniden yükleyip görev listesini kontrol edin. Yetki, denetim durumu veya kayıtlar değişmiş olabilir.','The pack save could not be confirmed; draft retained. Reload and check the task list. Permissions, audit state or records may have changed.')}</p>}
  {saved&&<p role="status">{t('Görev paketi kaydedildi. Görevleri listeden ve Benim İşlerim ekranından takip edebilirsiniz.','Task pack saved. Follow the tasks in the list and My Work.')}</p>}
  {preview&&<fieldset disabled={disabled||busy}><legend>{t('Kaydedilecek görevler','Tasks to create')}</legend><ol>{preview.map((item,index)=><li key={item.id}><b>{item.fields.title}</b><p>{item.fields.description}</p><p>{item.fields.owner} · {item.fields.dueDate} · {item.fields.timeZone}</p><p>{t('Ön koşul','Prerequisite')}: {item.fields.dependsOn?.length?preview[index-1].fields.title:'—'}</p></li>)}</ol><button type="button" onClick={()=>void save()}>{busy?t('Kaydediliyor…','Saving…'):t('Tüm görevleri kaydet','Save all tasks')}</button><button type="button" onClick={()=>setPreview(null)}>{t('Önizlemeyi kapat','Close preview')}</button></fieldset>}
 </details>;
}
