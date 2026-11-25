"use client";
import { useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { type ConnectedGrcRow as Row, type ConnectedGrcLink as Link } from './connected-grc-model';
import { type AccessSubject } from './module-access';
import { ChoiceInput } from './risk-editor-fields';
import { mapCode,mapTitle } from './connected-map-model';
import {contextId} from './connected-map-context';
import {linkChoices,issueChoice,nativeMapId} from './connected-map-links';
import { recordMatches,type WorkbenchIssue } from './connected-grc-workbench-model';

type Props = {row:Row;rows:Row[];links:Link[];lang:'tr'|'en';actor:AccessSubject & {email:string};issue?:WorkbenchIssue;moduleLabel:(name:string)=>string;refresh:()=>Promise<boolean>;close:()=>void;openRecord:(row:Row)=>void};
const errors: Record<string, [string, string]> = {
  changed: ['Kayıt değişti. Listeyi yenileyin ve güncel kaydı yeniden seçin.', 'Record changed. Refresh and select the current record again.'],
  unavailable: ['Kayıt artık erişilebilir değil. Seçiminizi yenileyin.', 'Record is no longer available. Refresh your selection.'],
  forbidden: ['Bu bağlantıyı değiştirme yetkiniz yok.', 'You cannot change this relationship.'],
  required: ['Bu ilişki zorunlu. Kaldırmak yerine başka bir kayıt seçin.', 'This relationship is required. Select a replacement instead.'],
  validation: ['Kaynak kayıtta tamamlanması gereken alanlar var. Kaydı açıp düzeltin.', 'The source record has incomplete fields. Open and correct it.'],
  'audit-closed': ['Kapalı denetimde değişiklik yapılamaz.', 'A closed audit cannot be changed.'],
  'not-linked': ['Eski metin referansını kaldırmak için kaynak kaydı düzenleyin.', 'Edit the source record to remove a legacy text reference.'],
  unchanged: ['Bu bağlantı zaten mevcut.', 'This relationship already exists.'],
};

export default function ConnectedLinkEditor({row,rows,lang,actor,issue,moduleLabel,refresh,close,openRecord}:Props){
  const tr=lang==='tr',index=tr?0:1,choices=linkChoices(row,actor,[...new Set(rows.map(r=>r.module))]);
  const initial=issueChoice(choices,issue);
  const [targetModule,setTargetModule]=useState(initial?.module||''),[key,setKey]=useState(initial?.key||''),[targetId,setTargetId]=useState('');
  const [query,setQuery]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[message,setMessage]=useState('');
  const pending=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current,trigger=document.activeElement;el?.showModal();return()=>{el?.close();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus({preventScroll:true})}},[]);
  const rules=choices.filter(c=>c.module===targetModule),choice=rules.find(c=>c.key===key)||rules[0];
  const allowed=rows.filter(r=>r.id!==row.id&&r.module===targetModule&&(choice?.field.startsWith('context-')?true:choice?.plan?(r.module==='BIA'||r.data.kind==='continuity-plan'&&r.data.status==='draft'&&(actor.role==='Admin'||r.data.owner===actor.email)):!r.id.startsWith('enterprise:')));
  const target=allowed.find(r=>r.id===targetId),title=(r:Row)=>mapCode(r)+' · '+mapTitle(r,tr);
  const options=allowed.filter(r=>recordMatches(r,query,lang)).map(r=>({value:r.id,label:title(r)}));
  async function save(){
    if(!choice)return;
    const actualSource=choice.reverse?target:row,actualTarget=choice.reverse?row:target;
    if (pending.current || locked || !actualSource || !actualTarget || !actualSource.updatedAt && !choice.field.startsWith('context-') || note.trim().length < 3) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(withBasePath('/api/connected-grc/links'), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ sourceId: choice.plan?nativeMapId(actualSource):choice.field.startsWith('context-')?contextId(actualSource):actualSource.id, targetId: choice.plan?nativeMapId(actualTarget):choice.field.startsWith('context-')?contextId(actualTarget):actualTarget.id,relation:choice.field.replace(/^context-/,''),kind:choice.field.startsWith('context-')?'context':choice.plan ? 'continuity-plan' : 'core', field: choice.field, expectedUpdatedAt: actualSource.updatedAt, action:'link', note: note.trim() }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(errors[result.code]?.[index] || (tr ? 'İşlem tamamlanamadı. Kaynağı kontrol edip yeniden deneyin.' : 'Action could not be completed. Check the source before retrying.'));
        if (response.status === 409 || response.status >= 500) setLocked(true);
        return;
      }
      // A successful mutation is never replayed after a refresh failure.
      setLocked(true);
      const loaded = await refresh();
      setMessage(loaded ? (tr ? 'Bağlantı kaydedildi. Görünüm yenilendi; işlem geçmişine eklendi.' : 'Relationship saved. View refreshed and history recorded.') : (tr ? 'Bağlantı kaydedildi; görünüm yenilenemedi. Tekrar kaydetmeyin, listeyi yenileyin.' : 'Relationship saved, but refresh failed. Refresh the list; do not save again.'));
    } catch { setLocked(true); setMessage(tr ? 'İşlemin sonucu doğrulanamadı. Tekrar kaydetmeden önce listeyi yenileyip bağlantıyı kontrol edin.' : 'Outcome could not be confirmed. Refresh and inspect the relationship before saving again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="cgw cm-dialog cgw-editor" aria-labelledby="cm-dialog-title" onCancel={e=>{e.preventDefault();if(!busy)close()}}>
    <header><h3 id="cm-dialog-title">{tr?'Bağlantı ekle':'Add relationship'}</h3><button type="button" disabled={busy} onClick={()=>{dialog.current?.close();close()}} aria-label={tr?'Kapat':'Close'}>×</button></header>
    <p>{title(row)}</p>
    <fieldset disabled={busy||locked}><label>{tr?'Hedef modül':'Target module'}<select value={targetModule} onChange={e=>{setTargetModule(e.target.value);setKey('');setTargetId('');setQuery('')}}>{[...new Set(choices.map(c=>c.module))].map(m=><option key={m} value={m}>{moduleLabel(m)}</option>)}</select></label>
    <label>{tr?'İlişki türü':'Relationship type'}<select value={choice?.key||''} onChange={e=>{setKey(e.target.value);setTargetId('');setQuery('')}}>{rules.map(c=><option key={c.key} value={c.key}>{c.label[index]} {c.reverse?'←':'→'}</option>)}</select></label>
     {choice?.field.startsWith('context-')&&<small>{tr?'Bu ilişki haritada saklanır. Kaynağın onay ve güvence durumunu değiştirmez.':'This map relationship preserves the source approval and assurance status.'}</small>}
    <ChoiceInput tr={tr} label={tr?'Hedef kayıt':'Target record'} query={query} onQuery={setQuery} options={options} choose={setTargetId} selection={target?{text:title(target),clear:()=>setTargetId('')}:undefined}/>
    <label>{tr?'İşlem notu':'Change note'}<textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} maxLength={1000}/></label>
    {choice?.plan&&<small>{tr?'Bağlamak planı onaylamaz.':'Linking does not approve the plan.'}</small>}
    <button type="button" className="primary" disabled={!target||note.trim().length<3} onClick={()=>void save()}>{tr?'Bağlantıyı kaydet':'Save relationship'}</button></fieldset>
    {message&&<p role="status">{message}</p>}
    {locked&&<button disabled={busy} type="button" onClick={()=>{dialog.current?.close();close();void refresh()}}>{tr?'Listeyi yenile ve kapat':'Refresh list and close'}</button>}
    <button disabled={busy} onClick={()=>{close();openRecord(row)}}>{tr?'Kaynak kaydı aç':'Open source record'}</button>
  </dialog>;
}
