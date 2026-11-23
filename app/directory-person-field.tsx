'use client';
import {useState} from 'react';
import {ChoiceInput} from './risk-editor-fields';
import {useChoices} from './workflow-selection-fields';
export function DirectoryPersonField({tr,label,value,onChange,reviewer=false,exclude=[]}:{tr:boolean;label:string;value:string;onChange:(value:string)=>void;reviewer?:boolean;exclude?:string[]}){
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
