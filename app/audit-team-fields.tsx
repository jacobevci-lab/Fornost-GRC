'use client';
import {useState} from 'react';
import {ChoiceInput} from './risk-editor-fields';
import {useChoices} from './workflow-selection-fields';
import {auditEmail,teamEmails} from './audit-engagement';

export function AuditTeamFields({tr,owner,team,onOwner,onTeam}:{tr:boolean;owner:string;team:string;onOwner:(s:string)=>void;onTeam:(s:string)=>void}) {
  const members=teamEmails(team);
  return <>{(['owner','team'] as const).map(kind=><AuditPerson key={kind} tr={tr} multiple={kind==='team'}
    value={kind==='team'?members:owner?[owner]:[]} exclude={kind==='team'?[owner]:members}
    change={values=>kind==='team'?onTeam(values.join('; ')):onOwner(values[0]||'')}/>)}</>;
}
function AuditPerson({tr,multiple,value,exclude,change}:{tr:boolean;multiple:boolean;value:string[];exclude:string[];change:(v:string[])=>void}) {
  const [query,setQuery]=useState('');
  const choices=useChoices('/api/grc/risk-owners?module=audit&q='+encodeURIComponent(query));
  const unavailable=new Set([...exclude,...value].map(s=>s.toLowerCase()));
  const options=(choices.data.people||[]).filter(p=>!unavailable.has(p.email.toLowerCase())).map(p=>({value:p.email.toLowerCase(),label:p.name+' · '+p.email}));
  const email=query.trim().toLowerCase();
  if(multiple && auditEmail(email) && !unavailable.has(email) && !options.some(o=>o.value===email))options.push({value:email,label:(tr?'E-postayı ekle · ':'Add email · ')+email});
  const label=multiple?(tr?'Denetçi / ekip':'Auditor / team'):(tr?'Denetim sahibi':'Audit owner');
  return <div className="audit-person"><ChoiceInput tr={tr} label={label} query={query} onQuery={setQuery} options={options} pending={choices.loading} more={choices.data.complete===false}
    message={email && exclude.some(s=>s.toLowerCase()===email)?(tr?'Denetim sahibi ve denetçi farklı kişiler olmalı.':'The audit owner and auditor must be different people.'):undefined}
    choose={s=>change(multiple?[...value,s]:[s])}/>
    <div className="risk-pills">{value.map(s=><button type="button" key={s} aria-label={(tr?'Kaldır · ':'Remove · ')+s} onClick={()=>change(value.filter(v=>v!==s))}>{s} ×</button>)}</div>
    {multiple&&<small>{tr?'Kurum dışı denetçi için e-posta adresini yazıp seçin.':'Enter and select an email address to add an external auditor.'}</small>}
    {choices.error&&<button type="button" onClick={choices.retry}>{tr?'Kullanıcı listesini yeniden yükle':'Retry user directory'}</button>}</div>;
}
