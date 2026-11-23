'use client';
import {useState,useRef} from 'react';
import {useChoices} from '../workflow-selection-fields';
import {hasRecoveryTarget,recoveryHoursLabel} from '../bia-recovery';
import {navigateToFornost} from '../navigation-focus';
import {noticeClock,type CrisisDetails} from './crisis';
import {postCrisis} from './crisis-actions';
import type {Incident} from './case-workspace';
import type {ReactNode} from 'react';

export function NotificationClock({row,now,tr}:{row:Incident;now:number;tr:boolean}){
 if(!row.personalData)return null;
 const clock=noticeClock(row.awarenessAt||row.detectedAt,now);
 const regime=row.notificationRegime==='kvkk'?'KVKK':row.notificationRegime==='gdpr'?'GDPR':'KVKK / GDPR';
 if(!clock)return <span className="ic-clock">{regime} · {tr?'72 saat · Başlangıç saati bilinmiyor':'72 hours · Start time unknown'}</span>;
 const t=new Intl.DateTimeFormat(tr?'tr-TR':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(clock.due);
 const anchor=row.awarenessAt?(tr?'Öğrenmeden itibaren':'From awareness'):(tr?'Tespitten itibaren ön değerlendirme':'Preliminary from detection');
 const exempt=row.notificationDecision==='not-required'&&['authority','both'].includes(row.notificationScope||'');
 const scopeNote=row.notificationScope==='individuals'?(tr?'Kurum kararı kaydedilmedi':'Authority decision pending'):null;
 return <span className={'ic-clock'+(clock.late&&!exempt?' ic-breach':'')} title={anchor+' · '+t}>{regime} · {tr?'Kurum bildirimi · 72 saat':'Authority notification · 72 hours'} · {exempt?(tr?'Kurum bildirimi gerekmiyor':'Authority notice not required'):<>{scopeNote&&<>{scopeNote} · </>}{anchor} · {clock.hours}{tr?' sa ':'h '}{clock.minutes}{tr?' dk ':'m '}{clock.late?(tr?'aşıldı':'overdue'):(tr?'kaldı':'remaining')}</>}</span>;
}
export function CommandBoard({row,tr,now,user,disabled,notification}:{row:Incident;tr:boolean;now:number;user:{role:string;email:string};disabled:boolean;notification:ReactNode}){
 const data=useChoices<CrisisDetails>('/api/incidents?'+new URLSearchParams({view:'crisis',incidentId:row.id,revision:row.updatedAt}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const sending=useRef(false);
 const open=(ref:string)=>navigateToFornost({module:'Bulgular ve CAPA',kind:'finding',ref,source:'incident-command',filter:{findingRef:ref}});
 async function create(){if(sending.current)return;sending.current=true;setBusy(true);setError('');
  try{const r=await postCrisis(row,'create-improvement',{lang:tr?'tr':'en'});const finding=r.body.finding as {id:string}|undefined;
   if(!r.response.ok||!finding?.id)throw Error();data.retry();open(finding.id);
  }catch{setError(tr?'Bulgu açılamadı. Kök nedeni, atamaları ve güncel olay durumunu kontrol edin.':'Could not open the finding. Check the root cause, assignments and current case state.');}
  finally{sending.current=false;setBusy(false);}
 }
 const elapsed=row.category==='availability'&&row.detectedAt&&(!['closed','review','recovered','cancelled'].includes(row.status)||data.data.restoredAt)?Math.max(0,((data.data.restoredAt?Date.parse(data.data.restoredAt):now)-Date.parse(row.detectedAt))/3600000):null;
 function target(value:unknown){const label=recoveryHoursLabel(value,tr);return elapsed===null||!hasRecoveryTarget(value)?label:label+' · '+(elapsed>Number(value)?(tr?'Aşıldı':'Exceeded'):(tr?'Hedef içinde':'Within target'));}
 const canCreate=!!row.rootCause&&['review','closed'].includes(row.status)&&user.email.toLowerCase()!==row.reviewer.toLowerCase()&&(user.role==='Admin'||user.role==='Editor'&&[row.owner,row.commander].includes(user.email));
 return <div className="ic-command"><section>{notification}<NotificationClock row={row} tr={tr} now={now}/></section>
 <section><h4>{tr?'Etkilenen varlıklar ve süreçler':'Affected assets and processes'}</h4>{data.loading?<p role="status">{tr?'Kayıtlar yükleniyor…':'Loading records…'}</p>:data.error?<button onClick={data.retry}>{tr?'Kayıtları tekrar yükle':'Retry records'}</button>:<>
 {data.data.targets?.length?<ul>{data.data.targets.map(t=><li key={t.id}><strong>{t.code} · {t.title}</strong><span>RTO · {target(t.rto)}</span><span>MTPD · {target(t.mtpd)}</span></li>)}</ul>:<p>{tr?'Eşleşen varlık veya BIA kaydı yok.':'No matching asset or BIA record.'}</p>}
 {elapsed===null&&!!data.data.targets?.length&&<small>{tr?'Kesinti süresi bilinmiyor. Tanımlı kurtarma hedefleri gösteriliyor.':'Disruption duration is unknown. Configured recovery targets are shown.'}</small>}{elapsed!==null&&<small>{tr?'Tespitten itibaren izlenen kesinti süresi':'Disruption tracked from detection'} · {recoveryHoursLabel(Math.round(elapsed*10)/10,tr)}</small>}</>}</section>
 <section><h4>{tr?'Kriz ekibi':'Crisis team'}</h4><dl>{[[tr?'Olay sahibi':'Incident owner',row.owner],[tr?'Olay yöneticisi':'Incident commander',row.commander],[tr?'Bağımsız inceleyen':'Independent reviewer',row.reviewer]].map(([role,email])=>{
  const person=data.data.people?.find(p=>p.email.toLowerCase()===email.toLowerCase());return <div key={role}><dt>{role}</dt><dd>{person?.name&&<strong>{person.name} · </strong>}<a href={'mailto:'+email}>{email}</a> · {person?(person.status==='Active'?(tr?'Hesap etkin':'Active account'):(tr?'Hesap etkin değil':'Inactive account')):(tr?'Hesap durumu bilinmiyor':'Account status unknown')}</dd></div>;})}</dl></section>
 <section><h4>{tr?'Kök neden ve iyileştirme':'Root cause and improvement'}</h4><p>{row.rootCause||(tr?'Kök neden olay incelemesinde kaydedilir.':'The root cause is recorded during incident review.')}</p>
 {data.data.finding?<button onClick={()=>open(data.data.finding!.id)}>{data.data.finding.code} · {tr?'Bulguyu aç':'Open finding'}</button>:canCreate&&<button disabled={disabled||busy||data.loading||data.error} onClick={()=>void create()}>+ {tr?'İyileştirme Bulgusu (CAPA) Oluştur':'Create improvement finding (CAPA)'}</button>}{error&&<p role="alert">{error}</p>}</section></div>;
}
