'use client';
import {useState} from 'react';
import {ChoiceInput} from '../risk-editor-fields';
import {useChoices} from '../workflow-selection-fields';
import type {FindingSourceChoice} from './source-records';

type Form=Record<string,string>;
type Fields={tr:boolean;form:Form;update:(patch:Form)=>void};
export const hasSourceCatalog=(type:string)=>['audit','continuous-control','vendor','incident','ai','regulatory','policy','control','risk'].includes(type);
export function FindingSourceFields({tr,form,update}:Fields){
  const [query,setQuery]=useState('');
  const connected=hasSourceCatalog(form.sourceType),external=!connected||form.sourceMode==='external',continuous=form.sourceType==='continuous-control';
  const choices=useChoices<{records:FindingSourceChoice[];more:boolean}>(external?null:'/api/findings?'+new URLSearchParams({view:'sources',source:form.sourceType,q:query}));
  const records=choices.data.records||[],label=tr?'Kaynak referansı':'Source reference';
  function clear(){update({sourceRef:'',sourceTitle:'',sourceDisplay:'',mappedControls:'',targetControlRef:''});}
  function select(id:string){
    const row=records.find(item=>item.id===id);if(!row)return;
    update({sourceMode:'record',sourceRef:row.id,sourceTitle:row.title,sourceDisplay:row.code,mappedControls:JSON.stringify(row.controls),targetControlRef:row.controls.length===1?row.controls[0]:''});
  }
  const controls:string[]=form.mappedControls?JSON.parse(form.mappedControls):[];
  return <>
    <div>{!external?<ChoiceInput tr={tr} label={label} query={query} onQuery={setQuery} required={!form.sourceRef}
      selection={{text:form.sourceDisplay||form.sourceRef,clear}} requiredMessage={tr?'Bir kaynak kaydı seçin.':'Select a source record.'}
      pending={choices.loading} more={choices.data.more} options={records.map(row=>({value:row.id,label:row.code+' · '+row.title}))} choose={select}/>:
      <label>{label}<input required maxLength={120} value={form.sourceRef} onChange={e=>update({sourceRef:e.target.value})}/></label>}
      {choices.error&&<button type="button" onClick={choices.retry}>{tr?'Kaynaklar alınamadı · Tekrar dene':'Unable to load sources · Retry'}</button>}
      {connected&&!continuous&&<label className="capa-external"><input type="checkbox" checked={external} onChange={e=>{setQuery('');update({sourceMode:e.target.checked?'external':'record',sourceRef:'',sourceTitle:'',sourceDisplay:''});}}/>{tr?'Kayıt dışı kaynak':'Unregistered source'}</label>}
    </div>
    <label>{tr?'Kaynak başlığı':'Source title'}<input required maxLength={240} value={form.sourceTitle} readOnly={!external} onChange={e=>update({sourceTitle:e.target.value})}/></label>
    {continuous&&<label>{tr?'Hedef kontrol':'Target control'}<select required value={form.targetControlRef||''} onChange={e=>update({targetControlRef:e.target.value})}><option value="">{tr?'Bağlı kontrol seçin':'Select a mapped control'}</option>{controls.map(ref=><option key={ref}>{ref}</option>)}</select></label>}
  </>;
}
export function FindingPersonField({tr,label,value,onChange,reviewer=false,exclude=[]}:{tr:boolean;label:string;value:string;onChange:(value:string)=>void;reviewer?:boolean;exclude?:string[]}){
  const [query,setQuery]=useState('');
  const choices=useChoices('/api/workflow-choices?'+new URLSearchParams({kind:'people',reviewer:String(reviewer),q:query}));
  const excluded=new Set(exclude.map(email=>email.toLowerCase()));
  const people=(choices.data.people||[]).filter(p=>!excluded.has(p.email.toLowerCase()));
  return <div><ChoiceInput tr={tr} label={label} query={query} onQuery={setQuery} selection={{text:value,clear:()=>onChange('')}}
    options={people.map(p=>({value:p.email,label:p.name+' · '+p.email}))} choose={onChange} pending={choices.loading}
    more={choices.data.complete===false} required={!value} requiredMessage={tr?'Dizinden bir kullanıcı seçin.':'Choose a directory user.'}/>
    {choices.error&&<button type="button" onClick={choices.retry}>{tr?'Kişiler alınamadı · Tekrar dene':'Unable to load people · Retry'}</button>}
  </div>;
}
