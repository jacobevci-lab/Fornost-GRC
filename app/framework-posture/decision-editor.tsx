'use client';
import {useState} from 'react';
import {postureRequest} from './client';
import {implementationIndex,requirementState,statusLabel} from './requirements';
import {CreateControl} from './create-control';
import type {Control,Coverage,Matrix,Requirement} from './types';

export type WorkspaceProps={tr:boolean;write:boolean;createControl:boolean;onControlCreated:()=>void};


const statusHelp = {
  unmapped: [
    'Maddeye kütüphaneden bir kontrol bağlayın. Destekleyen kontrolün güncel ve onaylı kanıtı durum hesabına katılır.',
    'Link a library control to this requirement. Current approved evidence on a supporting control counts toward its status.',
  ],
  implementation: [
    'Kontrol Kütüphanesi’nde uygulama durumunu gözden geçirin. Planlanan veya uygulanmayan kontrol bu maddeyi karşılamaz.',
    'Review the implementation in the Control Library. A planned or unimplemented control does not satisfy the requirement.',
  ],
  partial: [
    'Kontrol uygulamasını ve eşleştirmenin kapsamını kontrol edin. Maddeyi karşılayan bir kontrolü “Destekler” olarak eşleştirin.',
    'Review the control implementation and the extent of its mapping. Map a control that meets the requirement using “Supports”.',
  ],
  evidence: [
    'Kanıt Kütüphanesi’nde destekleyen kontrolün referansına bağlı güncel kanıtı onaylayın.',
    'In the Evidence Library, approve current evidence linked to the supporting control’s reference.',
  ],
  verification: ['Kontrol sahibi dışında yetkili bir insan, güncel kanıtla kontrol etkinliğini doğrulamalıdır.','An authorized human other than the control owner must verify effectiveness against current evidence.'],
  decision: [
    'Destekleyen kontrolün onaylı kanıtı var. SoA Kapsam sütunundan Uygulanabilirlik (SoA) kararını kaydedin.',
    'The supporting control has approved evidence. Save the applicability decision in the SoA scope column.',
  ],
  covered: [
    'Kapsamdaki bu maddeyi destekleyen kontrol, güncel ve onaylı kanıtla bağımsız olarak doğrulandı. Maddeyi “Tüm maddeler” listesinde bulabilirsiniz.',
    'A supporting control was independently verified against current approved evidence for this in-scope requirement. Find it under “All requirements”.',
  ],
  excluded: [
    'SoA kararına göre bu madde kapsam dışında. Kapsam değiştiğinde uygulanabilirlik kararını ve gerekçesini güncelleyin.',
    'The SoA decision excludes this requirement. If scope changes, update its applicability and rationale.',
  ],
} as const;

type EditorProps=WorkspaceProps & {row:Requirement;matrix:Matrix;onSave:()=>void;onReload:()=>void;onClose:()=>void};
export function DecisionEditor({row,matrix,tr,write,createControl,onControlCreated,onSave,onReload,onClose}:EditorProps){
  const [links,setLinks]=useState(row.links);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[choice,setChoice]=useState('');
  const [created,setCreated]=useState<Control[]>([]);
  const controls=[...matrix.controls,...created];
  const available=controls.filter(c=>!links.some(l=>l.id===c.id) && (c.code+' '+c.title).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const target=available.find(c=>c.id===choice);
  const dirty=JSON.stringify(links)!==JSON.stringify(row.links);
  const mappings = target ? [...links, {id:target.id, coverage:'supports' as const}] : links;
  const state = requirementState({...row, links:mappings}, matrix.pins, implementationIndex(controls));
  // The matrix includes evidence only for controls already mapped in this framework.
  const mappedInProgram = (id:string) => matrix.requirements.some(r=>r.links.some(l=>l.id===id));
  const pendingEvidenceCheck = state==='evidence' && mappings.some(l=>l.coverage==='supports' && !mappedInProgram(l.id));
  async function save(){
    setPending(true);setError('');
    try{
      await postureRequest({},undefined,{action:'save',name:matrix.name,ref:row.ref,revision:row.revision,applicability:row.applicability,reason:row.reason,links:mappings});
      onSave();
    }catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  return <section className="posture-editor" aria-label={tr?'Madde ayrıntısı':'Requirement details'} onKeyDown={e=>{
    if(e.key==='Escape'&&!pending&&!e.defaultPrevented){e.stopPropagation();onClose();}
  }}>
    <header><h4>{write?(tr?'Kütüphaneden kontrol bağla':'Link a library control'):(tr?'Bağlı kontroller':'Linked controls')}</h4>
      <button type="button" disabled={pending} onClick={onClose}>{tr?'Kapat':'Close'}</button></header>
    <p className="posture-state-help">{pendingEvidenceCheck
      ? <><strong>{tr?'Kaydedildiğinde':'After saving'}</strong> {tr
          ? 'Seçilen kontrolün güncel, onaylı kanıtı kontrol edilir ve madde durumu yeniden hesaplanır.'
          : 'The selected control is checked for current approved evidence and the requirement status is recalculated.'}</>
      : <><strong>{target||dirty ? (tr?'Kaydedildiğinde':'After saving') : (tr?'Hesaplanan durum':'Calculated status')} · {statusLabel(state,tr)}</strong> {statusHelp[state][tr?0:1]}</>}
    </p>
    <fieldset disabled={!write||pending}>
      {write&&<div className="posture-fields posture-picker"><label>{tr?'Kontrol ara':'Search controls'}
        <input type="search" value={search} placeholder={tr?'Kod veya başlık…':'Code or title…'} onChange={e=>{setSearch(e.target.value);setChoice('');}}/></label>
        <label>{tr?'Mevcut kontrol':'Existing control'}<select aria-label={tr?'Mevcut kontrol':'Existing control'} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">{tr?'Kontrol seçin':'Select a control'}</option>
          {available.slice(0,100).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label></div>}
      {write&&!available.length&&<p>{tr?'Seçilebilecek kontrol bulunamadı.':'No matching controls available.'}</p>}
      {links.length>0&&write&&<h5>{tr?'Bağlı kontroller':'Linked controls'}</h5>}
      {!links.length&&!write&&<p>{tr?'Bu maddeye bağlı kontrol yok.':'No control is linked to this requirement.'}</p>}
      {links.map(link=>{
        const c=controls.find(item=>item.id===link.id);
        if(!c)return null;
        return <div key={c.id} className="posture-linked"><strong>{c.code} · {c.title}</strong><span>{c.implementation}</span>
          <label>{tr?'Katkı':'Coverage'}<select value={link.coverage} onChange={e=>setLinks(links.map(l=>l.id===c.id?{...l,coverage:e.target.value as Coverage}:l))}>
            <option value="supports">{tr?'Destekler':'Supports'}</option><option value="partial">{tr?'Kısmen destekler':'Partially supports'}</option></select></label>
          {write&&<button type="button" onClick={()=>setLinks(links.filter(l=>l.id!==c.id))}>{tr?'Bağı kaldır':'Unlink'}</button>}
          {!!matrix.pins[c.id]?.length&&<ul>{matrix.pins[c.id].map(p=><li key={p.id}>{p.code} · {p.title} · v{p.version} · {p.period}{p.verified?<small> · {tr?'Etkin / Doğrulandı':'Effective / Verified'} · {p.verifiedBy}</small>:write&&<ControlVerification tr={tr} name={matrix.name} controlId={c.id} evidenceVersion={p.id} onSaved={onSave}/>}</li>)}</ul>}</div>;
      })}
      <div className="posture-editor-actions">{write&&createControl&&<CreateControl tr={tr} onCreated={c=>{
        onControlCreated();setCreated(previous=>[...previous,c]);setChoice('');
        setLinks(previous=>[...previous,{id:c.id,coverage:'supports'}]);
      }}/>}
      {write&&<button type="button" className="primary" disabled={!target&&!dirty} onClick={save}>
        {target?(tr?'Bağla ve kaydet':'Link and save'):(tr?'Eşleştirmeyi kaydet':'Save mapping')}</button>}</div>
      {created.length>0&&<p role="status">{tr?'Taslak kütüphaneye eklendi. Maddeye bağlamak için eşleştirmeyi kaydedin.':'Draft added to the library. Save the mapping to link it to this requirement.'}</p>}
    </fieldset>
    {error&&<p role="alert">{error==='409'?(tr?'Kayıt değişti. Güncel sürümü yükleyip tekrar düzenleyin.':'The record changed. Load the current version and edit again.'):(tr?'Kaydedilemedi. Tekrar deneyin.':'Could not save. Please retry.')} {error==='409'&&<button type="button" onClick={onReload}>{tr?'Yenile':'Reload'}</button>}</p>}
  </section>;
}

function ControlVerification({tr,name,controlId,evidenceVersion,onSaved}:{tr:boolean;name:string;controlId:string;evidenceVersion:string;onSaved:()=>void}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <details className="ec-finance"><summary>{tr?'Bağımsız etkinlik doğrulaması':'Independent effectiveness verification'}</summary><label>{tr?'Test ve doğrulama gerekçesi':'Test and verification rationale'}<textarea value={note} minLength={10} maxLength={2000} onChange={e=>setNote(e.target.value)}/></label><button type="button" disabled={busy||note.trim().length<10} onClick={async()=>{setBusy(true);setError('');try{await postureRequest({},undefined,{action:'verify-control',name,controlId,evidenceVersion,note});onSaved()}catch(e){setError((e as Error).message==='403'?(tr?'Kontrol/kanıt sahibi kendi kaydını doğrulayamaz; yetkili bağımsız doğrulayıcı gerekir.':'Owners cannot verify their own control/evidence; an authorized independent reviewer is required.'):(tr?'Doğrulanamadı. Güncel kontrol ve onaylı kanıtı yeniden yükleyin.':'Verification failed. Reload the current control and approved evidence.'))}finally{setBusy(false)}}}>{tr?'Etkin / Doğrulandı olarak kaydet':'Record as Effective / Verified'}</button>{error&&<p role="alert">{error}</p>}</details>;
}
