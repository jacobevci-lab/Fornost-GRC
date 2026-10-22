'use client';
import { useEffect,useId,useRef,useState } from 'react';
import { withBasePath } from './base-path';
import { accountViewState,type AccountView,type ViewScope } from './account-views';
import { validateViewState,type SavedViewState,type ViewSchema } from './saved-register-views';
import { WORK_MODULE_LABELS } from './work-queue-views';

type Props={module:string;lang:string;current:SavedViewState;schema:ViewSchema;labels?:Record<string,string>;focused?:boolean;variant?:'work';apply:(state:SavedViewState)=>void};
type List={views:AccountView[];complete:boolean;canManage:boolean;limit:number};
type Pending={action:'save'|'rename'|'delete';id:string;expectedRevision:string;name?:string;state?:SavedViewState;signature:string};
export function AccountViewsPanel({module,lang,current,schema,labels={},focused,variant,apply}:Props) {
  const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b,id=useId();
  const [scope,setScope]=useState<ViewScope>('personal'),[data,setData]=useState<List|null>(null),[selected,setSelected]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[needsReload,setNeedsReload]=useState(false),[pending,setPending]=useState<Pending|null>(null);
  const generation=useRef(0),abort=useRef<AbortController|null>(null),working=useRef(false),opened=useRef(false),newId=useRef('');
  useEffect(()=>()=>{generation.current++;abort.current?.abort();},[]);
  const row=data?.views.find(view=>view.id===selected),signature=JSON.stringify({scope,name,current,selected,revision:row?.revision,focused}),preview=pending?.signature===signature?pending:null;
  const messages:Record<string,string>={
    unavailable:t('Görünümler yüklenemedi. Önceki seçim kullanılamaz; Yenile ile tekrar deneyin.','Views could not be loaded. The previous selection cannot be used; refresh to retry.'),
    uncertain:t('Kaydın sonucu doğrulanamadı. Adınız ve filtreleriniz korundu. Yenileyip sunucudaki listeyi kontrol edin.','The write result could not be confirmed. Your name and filters were retained. Refresh and check the server list.'),
    conflict:t('Görünüm veya erişim yetkiniz değişti. Taslağınız korundu; yenileyip görünümü tekrar seçin.','The view or your access changed. Your draft was retained; refresh and select the view again.'),
    forbidden:t('Bu görünüm için güncel erişim yetkiniz yok.','You no longer have access to this view.'),
    missing:t('Görünüm kaldırılmış veya artık erişilemiyor. Listeyi yenileyin.','The view was removed or is no longer accessible. Refresh the list.'),
    duplicate:t('Bu kapsamda aynı adlı bir görünüm var. Başka bir ad girin.','A view with this name exists in this scope. Enter another name.'),
    name:t('1–60 karakterlik bir ad girin.','Enter a name of 1–60 characters.'),
    schema:t('Görünüm desteklenmeyen alanlar içeriyor. Güncel filtre ve sütunlarla tekrar oluşturun.','The view contains unsupported fields. Recreate it with current filters and columns.'),
    fields:t('Görünüm kaydedilemedi. Alanları ve boyutu kontrol edin.','The view could not be saved. Check its fields and size.'),
    limit:t('Bu kapsamın görünüm sınırına ulaşıldı. Önce kullanmadığınız bir görünümü kaldırın.','This scope has reached its view limit. Remove an unused view first.'),
    incomplete:t('Görünüm listesi eksik. Liste doğrulanana kadar işlemler kapalı.','The view list is incomplete. Actions are disabled until it can be verified.'),
  };
  function path(activeScope:ViewScope,itemId?:string) {const q=new URLSearchParams({module,scope:activeScope});if(itemId)q.set('id',itemId);return withBasePath('/api/views?'+q);}
  async function request(url:string,init:RequestInit={}) {
    const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
    try {const response=await fetch(url,{...init,cache:'no-store',signal:controller.signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'unavailable');return body;} finally {clearTimeout(timer);}
  }
  function verified(body:List):List {
    if(!body||!Array.isArray(body.views)||typeof body.complete!=='boolean'||typeof body.canManage!=='boolean'||![20,50].includes(body.limit)||body.views.length>body.limit)throw new Error('unavailable');
    for(const view of body.views){if(view.module!==module||!view.id||!view.revision||typeof view.name!=='string')throw new Error('unavailable');accountViewState(module,view.state);}
    return body;
  }
  async function load(nextScope=scope) {
    if(working.current)return;const gen=++generation.current;abort.current?.abort();setBusy(true);setError('');setNotice('');setData(null);setSelected('');setPending(null);setNeedsReload(true);
    try {const next=verified(await request(path(nextScope)));if(gen!==generation.current)return;setData(next);setNeedsReload(!next.complete);if(!next.complete)setError('incomplete');if(next.views.some(view=>view.id===newId.current))newId.current='';}
    catch(e){if(gen===generation.current)setError(e instanceof Error&&messages[e.message]?e.message:'unavailable');}
    finally{if(gen===generation.current)setBusy(false);}
  }
  function choose(value:string){setSelected(value);setName(data?.views.find(view=>view.id===value)?.name||'');setPending(null);setError('');setNotice('');}
  function prepare(action:Pending['action'],fresh=false){
    setError('');setNotice('');setPending(null);
    try{if(action!=='delete'&&(!name.trim()||name.trim().length>60))throw new Error('name');
      if(fresh&&!newId.current)newId.current='SV-'+crypto.randomUUID();
      const state=action==='save'?accountViewState(module,validateViewState(current,schema)):undefined;
      setPending({action,id:fresh?newId.current:row!.id,expectedRevision:fresh?'':row!.revision,...(action!=='delete'?{name:name.trim()}:{}),...(state?{state}:{}),signature});
    }catch(e){setError(e instanceof Error&&messages[e.message]?e.message:'fields');}
  }
  async function commit(){
    if(!preview||working.current||needsReload)return;working.current=true;setBusy(true);setError('');setNotice('');const gen=++generation.current,{signature:_signature,...change}=preview;void _signature;
    try{await request(withBasePath('/api/views'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module,scope,...change})});if(gen!==generation.current)return;
      setPending(null);setSelected('');setNeedsReload(true);if(change.action==='save'&&!change.expectedRevision)newId.current='';
      const next=verified(await request(path(scope)));if(gen!==generation.current)return;setData(next);setNeedsReload(!next.complete);if(!next.complete)setError('incomplete');else setNotice(change.action==='delete'?'deleted':'saved');
      const saved=next.views.find(view=>view.id===change.id);if(saved){setSelected(saved.id);setName(saved.name);}
    }catch(e){if(gen===generation.current){setPending(null);setNeedsReload(true);setError(e instanceof Error&&messages[e.message]&&e.message!=='unavailable'?e.message:'uncertain');}}
    finally{working.current=false;if(gen===generation.current)setBusy(false);}
  }
  async function applyView(){
    if(!row||working.current||needsReload)return;working.current=true;setBusy(true);setNotice('');setError('');const gen=++generation.current;
    try{const latest=verified(await request(path(scope,row.id)));if(gen!==generation.current)return;const found=latest.views[0];if(!found||found.revision!==row.revision)throw new Error('conflict');apply(validateViewState(found.state,schema));setPending(null);setNotice('applied');}
    catch(e){if(gen===generation.current){setNeedsReload(true);setError(e instanceof Error&&messages[e.message]?e.message:'unavailable');}}
    finally{working.current=false;if(gen===generation.current)setBusy(false);}
  }
  function valueLabel(key:string,value:string){
    if(variant==='work'&&key==='module')return WORK_MODULE_LABELS[value]?.[tr?'tr':'en']||value;
    if(variant==='work'&&key==='status')return ({today:t('Bugün','Today'),priority:t('Öncelikli','Priority'),overdue:t('Geciken','Overdue'),soon:t('14 gün','14 days'),waiting:t('Başkalarında bekleyen','Waiting for others'),undated:t('Tarihsiz','Undated'),completed:t('Tamamlanan','Completed'),all:t('Tümü','All')} as Record<string,string>)[value]||value;
    return value;
  }
  function criteria(state:SavedViewState){return <dl className="account-view-criteria"><dt>{t('Arama','Search')}</dt><dd>{state.query||t('Arama yok','No search')}</dd>{Object.entries(state.filters).map(([key,value])=><div key={key}><dt>{labels[key]||key}</dt><dd>{valueLabel(key,value)}</dd></div>)}{!Object.keys(state.filters).length&&<><dt>{t('Filtreler','Filters')}</dt><dd>{t('Filtre yok','No filters')}</dd></>}{variant!=='work'&&<><dt>{t('Sütunlar','Columns')}</dt><dd>{state.columns.map(key=>labels[key]||key).join(', ')}</dd></>}</dl>;}
  const disabled=busy||needsReload||!data?.complete,writeDisabled=disabled||!data?.canManage;
  return <details className="account-views" onToggle={event=>{if(event.currentTarget.open&&!opened.current){opened.current=true;void load();}}}><summary>{t('Hesap ve ortak görünümler','Account and team views')}</summary><div>
    <p>{t('Kişisel görünümlerinize diğer cihazlardan da erişebilirsiniz. Yöneticinin paylaştığı ortak görünümleri, modüle erişimi olan kullanıcılar kullanabilir.','Access your personal views from other devices. Views shared by an administrator are available to users with access to the module.')}</p>
    <p>{variant==='work'?t('Yalnızca arama, modül ve iş durumu saklanır. Uygulama mevcut Benim/Organizasyon kapsamını korur.','Only search, module and work status are saved. Applying preserves your current Mine/Organization scope.'):t('Yalnızca arama, filtreler ve sütunlar saklanır. Görünümler güncel yetkilerinizle güncel kayıtlara uygulanır.','Only search, filters and columns are saved. Views use current records and your current permissions.')}</p>
    <label htmlFor={`${id}-scope`}>{t('Görünüm kapsamı','View scope')}</label><select id={`${id}-scope`} disabled={busy} value={scope} onChange={event=>{const next=event.target.value as ViewScope;setScope(next);setName('');void load(next);}}><option value="personal">{t('Kişisel hesabım','My account')}</option><option value="team">{t('Ortak görünümler','Team views')}</option></select>
    <button type="button" disabled={busy} onClick={()=>void load()}>{t('Görünümleri yenile','Refresh account views')}</button>
    {busy&&<p role="status">{t('İşleniyor…','Working…')}</p>}{error&&<p role="alert">{messages[error]||messages.unavailable}</p>}{notice&&!busy&&<p role="status">{{saved:t('Görünüm sunucuya kaydedildi.','View saved to the server.'),deleted:t('Görünüm kaldırıldı; kayıtlar korunuyor.','View removed; records are preserved.'),applied:t('Görünüm güncel kayıtlara uygulandı.','View applied to current records.')}[notice]}</p>}
    {data&&<><div className="saved-view-fields"><label htmlFor={`${id}-select`}>{t('Hesap görünümü seç','Select account view')}</label><select id={`${id}-select`} value={selected} disabled={disabled} onChange={event=>choose(event.target.value)}><option value="">{t('Yeni görünüm','New view')}</option>{data.views.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select><label htmlFor={`${id}-name`}>{t('Hesap görünümü adı','Account view name')}</label><input id={`${id}-name`} maxLength={60} value={name} disabled={busy} onChange={event=>{setName(event.target.value);setPending(null);}}/></div>
      <p>{data.views.length}/{data.limit}{scope==='team'&&!data.canManage?' · '+t('Ortak görünümleri yalnızca yönetici değiştirebilir.','Only an administrator can change team views.'):''}</p>
      {row&&<section aria-label={t('Kaydedilen ölçütler','Saved criteria')}><b>{row.name}</b>{criteria(row.state)}</section>}
      {focused&&<p>{t('Tek kayıt odağı kaydedilmez. Önce tüm kayıtları gösterin.','Exact record focus cannot be saved. Show all records first.')}</p>}
      <div className="saved-view-actions"><button type="button" disabled={disabled||!row} onClick={()=>void applyView()}>{t('Hesap görünümünü uygula','Apply account view')}</button>{data.canManage&&<><button type="button" disabled={writeDisabled||focused||data.views.length>=data.limit} onClick={()=>prepare('save',true)}>{t('Yeni kaydı önizle','Preview new account view')}</button><button type="button" disabled={writeDisabled||focused||!row} onClick={()=>prepare('save')}>{t('Güncellemeyi önizle','Preview account view update')}</button><button type="button" disabled={writeDisabled||!row} onClick={()=>prepare('rename')}>{t('Ad değişikliğini önizle','Preview account view rename')}</button><button type="button" disabled={writeDisabled||!row} onClick={()=>prepare('delete')}>{t('Kaldırmayı önizle','Preview account view removal')}</button></>}</div>
      {preview&&<section className="account-view-preview" aria-label={t('Görünüm değişikliği önizlemesi','View change preview')}><h4>{preview.action==='delete'?t('Görünümü kaldır','Remove view'):t('Kaydedilecek görünüm','View to save')}</h4><p><strong>{preview.name||row?.name}</strong> · {scope==='personal'?t('Yalnızca sizin hesabınız','Your account only'):t('Modüle erişimi olan kullanıcılarla paylaşılır','Shared with users who can access this module')}</p>{preview.action==='delete'?<p>{t('Bu işlem yalnızca görünümü kaldırır; iş kayıtları silinmez.','This removes only the view; business records are not deleted.')}</p>:criteria(preview.state||row!.state)}<div className="saved-view-actions"><button type="button" disabled={writeDisabled} onClick={()=>void commit()}>{preview.action==='delete'?t('Görünümü kaldırmayı onayla','Confirm view removal'):t('Görünümü kaydet','Save account view')}</button><button type="button" disabled={busy} onClick={()=>setPending(null)}>{t('Vazgeç','Cancel view change')}</button></div></section>}
    </>}
  </div></details>;
}
