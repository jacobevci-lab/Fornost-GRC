'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {validateSharedTemplate,type SharedTemplate,type SharedTemplateKind,type SharedTemplateRecord,type SharedTemplateSummary,type SharedTemplateVersion} from './audit-shared-templates';

type Detail={current:SharedTemplateSummary;selected:SharedTemplateRecord;history:SharedTemplateVersion[];historyComplete:boolean};
type Pending={id:string;action:'save'|'archive'|'restore';expectedRevision:string;template:SharedTemplate;note:string;source:string;name:string};
export function AuditTemplateLibrary({kind,tr,source,disabled,onChoose}:{kind:SharedTemplateKind;tr:boolean;source:SharedTemplate|null;disabled:boolean;onChoose:(template:SharedTemplate)=>void}){
 const t=(a:string,b:string)=>tr?a:b,id=useId(),sourceKey=JSON.stringify(source);
 const [rows,setRows]=useState<SharedTemplateSummary[]>([]),[valid,setValid]=useState(false),[manage,setManage]=useState(false),[complete,setComplete]=useState(true),[archived,setArchived]=useState(false),[query,setQuery]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[busy,setBusy]=useState(false),[name,setName]=useState(''),[note,setNote]=useState(''),[pending,setPending]=useState<Pending|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),generation=useRef(0),writing=useRef(false),newId=useRef('');
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 async function request(path:string,body?:unknown){
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);
  try{const response=await fetch(withBasePath('/api/audits/templates'+path),{signal:abort.signal,...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'unavailable');return result;}finally{clearTimeout(timer);}
 }
 async function load(showArchived=archived){
  if(writing.current)return;const ticket=++generation.current;setBusy(true);setValid(false);setDetail(null);setPending(null);setError('');setNotice('');setArchived(showArchived);
  try{const result=await request('?'+new URLSearchParams({kind,archived:showArchived?'1':'0'}));if(ticket!==generation.current)return;
   setRows(result.templates);setManage(result.canManage);setComplete(result.complete);setValid(true);
   // A timed-out create may have committed. Reconcile its stable ID before offering another create.
   if(newId.current&&result.templates.some((row:SharedTemplateSummary)=>row.id===newId.current))newId.current='';
  }catch{if(ticket===generation.current)setError('load');}finally{if(ticket===generation.current)setBusy(false);}
 }
 async function select(key:string,revision?:string){
  if(writing.current)return;const ticket=++generation.current;setBusy(true);setDetail(null);setPending(null);setError('');setNotice('');
  try{const result=await request('?'+new URLSearchParams({id:key,...(revision?{revision}:{})}));if(ticket!==generation.current)return;setDetail(result);setName(result.current.name);setNote('');}
  catch{if(ticket===generation.current){setError('load');setValid(false);}}finally{if(ticket===generation.current)setBusy(false);}
 }
 function prepare(action:Pending['action'],update=false){
  if(disabled||busy||writing.current||!valid||!manage)return;
  try{if(note.trim().length<3||note.length>2000)throw Error('fields');
   const template=action==='save'?validateSharedTemplate({...source,name}):detail?.selected.template;
   if(!template||template.kind!==kind||(update&&!detail))throw Error('fields');
   if(!newId.current)newId.current='AST-'+crypto.randomUUID();
   setPending({id:update||action!=='save'?detail!.current.id:newId.current,action,expectedRevision:update||action!=='save'?detail!.current.revision:'',template,note:note.trim(),source:sourceKey,name});setError('');setNotice('');
  }catch{setPending(null);setError('fields');}
 }
 const preview=pending&&pending.source===sourceKey&&pending.name===name&&pending.note===note.trim()?pending:null;
 async function commit(){
  if(!preview||disabled||busy||writing.current||!valid)return;writing.current=true;const ticket=++generation.current;setBusy(true);setError('');
  const {source:unusedSource,name:unusedName,...body}=preview;void unusedSource;void unusedName;
  try{await request('',body);if(ticket!==generation.current)return;newId.current='';setPending(null);setNote('');writing.current=false;await load(archived);setNotice(t('Ortak şablon kaydedildi. Mevcut denetim kayıtları değiştirilmedi.','Shared template saved. Existing audit records were not changed.'));}
  catch{if(ticket===generation.current){setValid(false);setError('save');}}
  finally{writing.current=false;if(ticket===generation.current)setBusy(false);}
 }
 const active=detail&&!detail.current.archived&&detail.selected.revision===detail.current.revision;
 const visible=rows.filter(row=>row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <details className="audit-shared-library" onToggle={e=>{if(e.currentTarget.open&&!valid&&!busy)void load();}}>
  <summary>{t('Ortak şablon kütüphanesi','Shared template library')}</summary>
  <p>{t('Kurum şablonları bu kurulumdaki denetim kullanıcılarıyla paylaşılır. Güncel bir şablonu önizleyip taslağa aktarın; mevcut kayıtlar kendiliğinden güncellenmez.','Organization templates are shared with audit users in this installation. Preview a current template and transfer it to your draft; existing records do not update automatically.')}</p>
  <div className="at-actions"><button type="button" disabled={busy} onClick={()=>void load()}>{t('Kütüphaneyi yenile','Refresh library')}</button><label><input type="checkbox" checked={archived} disabled={busy} onChange={e=>void load(e.target.checked)}/>{t('Arşivlenenleri göster','Show archived')}</label></div>
  {busy&&<p role="status">{t('Kütüphane işleniyor…','Loading or saving library…')}</p>}
  {error&&<p role="alert">{error==='fields'?t('Şablon adını, taslak içeriğini ve en az üç karakterlik değişiklik gerekçesini kontrol edin.','Check the template name, draft content and a change reason of at least three characters.'):error==='save'?t('Kayıt doğrulanamadı; taslağınız korundu. Başka bir yönetici, yetki veya kapasite değişikliği olabilir. Yeniden kaydetmeden önce kütüphaneyi yenileyip güncel sürümü kontrol edin.','Save could not be confirmed; your draft was retained. Another administrator, permissions or capacity may have changed. Refresh the library and inspect the current version before saving again.'):t('Kütüphane yüklenemedi. Eski seçim kullanılamaz; yenileyerek tekrar deneyin.','Library could not be loaded. Previous selection cannot be used; refresh to retry.')}</p>}
  {notice&&<p role="status">{notice}</p>}
  {valid&&<>
   {!complete&&<p role="alert">{t('Liste sınırlandırıldı; tüm şablonlar gösterilmiyor.','The list is bounded; not all templates are shown.')}</p>}
   <label htmlFor={`${id}-search`}>{t('Ortak şablon ara','Search shared templates')}</label><input id={`${id}-search`} aria-label={t('Ortak şablon ara','Search shared templates')} value={query} maxLength={80} onChange={e=>setQuery(e.target.value)}/>
   <ul className="atl-list">{visible.map(row=><li key={row.id}><button type="button" disabled={busy} aria-pressed={detail?.current.id===row.id} onClick={()=>void select(row.id)}>{row.name} · v{row.version}</button><small>{row.updatedBy} · {new Date(row.updatedAt).toLocaleString(tr?'tr-TR':'en-GB')}</small></li>)}</ul>
   {!visible.length&&<p>{t('Bu görünümde şablon yok.','No templates in this view.')}</p>}
  </>}
  {detail&&valid&&<fieldset disabled={busy}><legend>{t('Şablon içeriği','Template content')}: {detail.selected.name} · v{detail.selected.version}</legend>
   <TemplateContent template={detail.selected.template} tr={tr}/>
   {!active&&<p>{t('Bu sürüm salt okunurdur. Taslağa aktarmak için güncel, aktif sürümü seçin.','This version is read-only. Select the current, active version to transfer it to a draft.')}</p>}
   <button type="button" disabled={disabled||!active} onClick={()=>{onChoose(detail.selected.template);setNotice(t('Şablon önizlemeye aktarıldı. Denetim kaydı henüz değişmedi.','Template transferred to preview. No audit record has changed.'));}}>{t('Bu şablonu taslak önizlemesine aktar','Transfer template to draft preview')}</button>
   <label htmlFor={`${id}-version`}>{t('Şablon sürümü','Template version')}</label><select id={`${id}-version`} aria-label={t('Şablon sürümü','Template version')} value={detail.selected.revision} onChange={e=>void select(detail.current.id,e.target.value)}>{detail.history.map(v=><option key={v.revision} value={v.revision}>v{v.version} · {v.actor} · {v.createdAt}</option>)}</select>
   {detail.history.filter(v=>v.revision===detail.selected.revision).map(v=><p key={v.revision}>{t('Değişiklik gerekçesi','Change reason')}: {v.note}</p>)}
   {!detail.historyComplete&&<p>{t('Son 50 sürüm listelenir; önceki sürümler saklanmaya devam eder.','The latest 50 versions are listed; earlier versions remain retained.')}</p>}
  </fieldset>}
  {manage&&valid&&<fieldset disabled={disabled||busy}><legend>{t('Kütüphane yönetimi','Library administration')}</legend>
   <p>{t('Yeni şablon veya yeni sürüm, bu ekrandaki mevcut taslak metinlerini kullanır. Kaydetmeden önce paylaşılacak içeriği kontrol edin.','A new template or version uses the current draft text on this screen. Review the content to be shared before publishing.')}</p>
   <label htmlFor={`${id}-name`}>{t('Ortak şablon adı','Shared template name')}</label><input id={`${id}-name`} aria-label={t('Ortak şablon adı','Shared template name')} maxLength={80} value={name} onChange={e=>{setName(e.target.value);setPending(null);}}/>
   <label htmlFor={`${id}-note`}>{t('Şablon değişiklik gerekçesi','Template change reason')}</label><textarea id={`${id}-note`} aria-label={t('Şablon değişiklik gerekçesi','Template change reason')} maxLength={2000} rows={2} value={note} onChange={e=>{setNote(e.target.value);setPending(null);}}/>
   <button type="button" disabled={!source} onClick={()=>prepare('save')}>{t('Yeni ortak şablonu önizle','Preview new shared template')}</button>
   {active&&<button type="button" disabled={!source} onClick={()=>prepare('save',true)}>{t('Seçili şablonun yeni sürümünü önizle','Preview new version of selected template')}</button>}
   {detail&&detail.selected.revision===detail.current.revision&&<button type="button" onClick={()=>prepare(detail.current.archived?'restore':'archive')}>{detail.current.archived?t('Yeniden etkinleştirmeyi önizle','Preview reactivation'):t('Arşivlemeyi önizle','Preview archiving')}</button>}
  </fieldset>}
  {preview&&valid&&<fieldset className="atl-publish" disabled={disabled||busy}><legend>{t('Kütüphaneye kaydedilecek değişiklik','Change to publish to the library')}</legend><b>{preview.template.name}</b><p>{preview.action==='archive'?t('Arşivlenecek. Önceden oluşturulmuş denetim kayıtları korunur.','Will be archived. Previously created audit records are preserved.'):preview.action==='restore'?t('Yeniden etkinleştirilecek.','Will be reactivated.'):preview.expectedRevision?t('Seçili şablonun yeni sürümü oluşturulacak.','A new version of the selected template will be created.'):t('Yeni ortak şablon oluşturulacak.','A new shared template will be created.')}</p><TemplateContent template={preview.template} tr={tr}/><p>{preview.note}</p><button type="button" onClick={()=>void commit()}>{t('Kütüphane değişikliğini kaydet','Publish library change')}</button><button type="button" onClick={()=>setPending(null)}>{t('Kütüphane önizlemesini kapat','Close library preview')}</button></fieldset>}
 </details>;
}
function TemplateContent({template,tr}:{template:SharedTemplate;tr:boolean}){
 const names:Record<string,[string,string]>={objective:['Amaç','Objective'],scope:['Kapsam','Scope'],exclusions:['Kapsam dışı','Exclusions'],methodology:['Yöntem','Methodology'],deliverables:['Çıktılar','Deliverables'],milestones:['Aşamalar','Milestones'],title:['Başlık','Title'],description:['Açıklama','Description']};
 return template.kind==='task-pack'?<><p>{template.chain?(tr?'Görevler sırayla bağlanacak.':'Tasks will be linked in sequence.'):(tr?'Görevler bağımsız başlayacak.':'Tasks will start independently.')}</p><ol>{template.tasks.map((task,i)=><li key={i}><b>{task.title}</b><p>{task.description||'—'}</p></li>)}</ol></>:<dl>{Object.entries(template.fields).map(([key,value])=><div key={key}><dt>{names[key]?.[tr?0:1]||key}</dt><dd>{value||'—'}</dd></div>)}</dl>;
}
