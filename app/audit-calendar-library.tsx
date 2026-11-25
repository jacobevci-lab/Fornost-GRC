'use client';
import {useEffect,useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {validateAuditCalendar,type AuditCalendar} from './audit-calendar-template';
import type {AuditCalendarSource} from './audit-reminder-profile';
import {validateSharedTemplate,type SharedTemplateRecord} from './audit-shared-templates';
import {AuditTemplateLibrary} from './audit-template-library';
import './audit-template-panel.css';

export function AuditCalendarLibrary({calendar,source,lang,disabled,onApply}:{calendar:AuditCalendar;source?:AuditCalendarSource|null;lang:string;disabled:boolean;onApply:(calendar:AuditCalendar,source:AuditCalendarSource|null)=>void}){
 const tr=lang!=='en',t=(a:string,b:string)=>tr?a:b,key=JSON.stringify({calendar,source});
 const [preview,setPreview]=useState<{record:SharedTemplateRecord;key:string}|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[statusKey,setStatusKey]=useState('');
 const controller=useRef<AbortController|null>(null),generation=useRef(0),flight=useRef(false);
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 let validCalendar:AuditCalendar|null=null;
 try{validCalendar=validateAuditCalendar(calendar);}catch{/* Invalid drafts cannot be published. */}
 async function check(){
  if(!source||disabled||flight.current)return;
  flight.current=true;const ticket=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);
  setBusy(true);setStatus('');setStatusKey(key);setPreview(null);
  try{
   const response=await fetch(withBasePath('/api/audits/templates?'+new URLSearchParams({id:source.id})),{signal:abort.signal});
   if(!response.ok)throw Error('load');const data=await response.json(),template=validateSharedTemplate(data.selected.template);
   if(template.kind!=='calendar'||data.selected.revision!==data.current.revision)throw Error('load');
   if(ticket!==generation.current)return;
   if(data.current.archived)setStatus('archived');
   else if(data.current.revision===source.revision)setStatus('current');
   else{setStatus('updated');setPreview({record:{...data.selected,template},key});}
  }catch{if(ticket===generation.current)setStatus('error');}
  finally{clearTimeout(timer);flight.current=false;if(ticket===generation.current)setBusy(false);}
 }
 const visibleStatus=statusKey===key?status:'';
 const selected=preview?.key===key&&preview.record.template.kind==='calendar'?preview.record:null;
 const incoming=selected?.template.kind==='calendar'?selected.template.calendar:null;
 const days=tr?['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 return <section className="audit-template-panel ar-shared-calendar" aria-label={t('Ortak takvim yönetimi','Shared calendar management')} style={{gridColumn:'1 / -1'}}>
  {source?<><p>{t('Taslak kaynak sürümü','Draft source version')}: <b>{source.name} · v{source.version}</b></p><div className="at-actions"><button type="button" disabled={disabled||busy} onClick={()=>void check()}>{t('Takvim güncellemelerini kontrol et','Check calendar updates')}</button><button type="button" disabled={disabled||busy} onClick={()=>{onApply(calendar,null);setPreview(null);setStatus('');}}>{t('Yerel takvim olarak devam et','Use as local calendar')}</button></div></>:<p>{t('Yerel takvim. Ortak bir takvimi seçerek kaynak sürümünü bu denetimde izleyebilirsiniz.','Local calendar. Select a shared calendar to track its source version in this audit.')}</p>}
  {busy&&<p role="status">{t('Güncel sürüm kontrol ediliyor…','Checking current version…')}</p>}
  {visibleStatus==='error'&&<p role="alert">{t('Güncel takvim doğrulanamadı. Taslağınız korundu; tekrar kontrol edin.','The current calendar could not be verified. Your draft was retained; check again.')}</p>}
  {visibleStatus&&visibleStatus!=='error'&&<p role="status">{visibleStatus==='current'?t('Seçilen sürüm güncel.','The selected version is current.'):visibleStatus==='archived'?t('Kaynak takvim arşivlenmiş. Bu denetim kayıtlı sürümü kullanmayı sürdürür. Başka bir aktif takvim seçebilir veya yerel takvime geçebilirsiniz.','The source calendar is archived. This audit keeps its saved version. Choose another active calendar or continue with a local calendar.'):visibleStatus==='applied'?t('Kaynak sürümü taslağa uygulandı. Kalıcı olması için profili kaydedin.','Source version applied to the draft. Save the profile to persist it.'):t('Yeni sürüm var. Aşağıdaki değişiklikleri inceleyip uygulayın.','A newer version is available. Review the changes below before applying.')}</p>}
  <AuditTemplateLibrary kind="calendar" tr={tr} source={validCalendar?{version:1,kind:'calendar',name:'Calendar',calendar:validCalendar}:null} disabled={disabled||busy} onChoose={(_,record)=>{setPreview({record,key});setStatus('');}}/>
  {selected&&incoming&&<fieldset disabled={disabled||busy}><legend>{t('Ortak takvim değişiklik önizlemesi','Shared calendar change preview')}: {selected.name} · v{selected.version}</legend>
   <p>{t('Mevcut gün hesabı','Current day counting')}: {calendar.mode==='business'?t('İş günü','Business days'):t('Takvim günü','Calendar days')}</p>
   <p>{t('Gelen gün hesabı','Incoming day counting')}: {incoming.mode==='business'?t('İş günü','Business days'):t('Takvim günü','Calendar days')}</p>
   <p>{t('Mevcut çalışma günleri','Current working days')}: {calendar.weekdays.map(day=>days[day]).join(', ')}</p><p>{t('Gelen çalışma günleri','Incoming working days')}: {incoming.weekdays.map(day=>days[day]).join(', ')}</p>
   <p>{t('Eklenecek tatiller','Holidays to add')}: {incoming.holidays.filter(day=>!calendar.holidays.includes(day)).join(', ')||'—'}</p><p>{t('Kaldırılacak tatiller','Holidays to remove')}: {calendar.holidays.filter(day=>!incoming.holidays.includes(day)).join(', ')||'—'}</p>
   <p>{t('Yalnızca gün hesabı, çalışma günleri ve tatiller değiştirilir. Eşikler, eskalasyon sorumlusu, saat dilimleri ve kayıtlı terminler korunur.','Only day counting, working days and holidays are replaced. Thresholds, escalation recipient, time zones and saved deadlines are preserved.')}</p>
   <button type="button" onClick={()=>{const nextSource={id:selected.id,revision:selected.revision,name:selected.name,version:selected.version};onApply(incoming,nextSource);setPreview(null);setStatus('applied');setStatusKey(JSON.stringify({calendar:incoming,source:nextSource}));}}>{t('Ortak takvimi taslağa uygula','Apply shared calendar to draft')}</button><button type="button" onClick={()=>{setPreview(null);setStatus('');}}>{t('Takvim önizlemesini kapat','Close calendar preview')}</button>
  </fieldset>}
 </section>;
}
