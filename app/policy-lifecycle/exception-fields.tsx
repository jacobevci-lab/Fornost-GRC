'use client';
import {useState,useContext} from 'react';
import {ChoiceInput} from '../risk-editor-fields';
import {useChoices} from '../workflow-selection-fields';
import type {RecordSearchPage} from '../record-search-store';

import {ModuleTrailContext} from '../module-record-trail-view';
import {resolveCoreRecord} from '../core-record-focus';
import {navigateToFornost} from '../navigation-focus';
type Pick={id:string;label:string};
const sources={asset:'Varlık Envanteri',vendor:'Tedarikçiler',control:'Kontroller',risk:'Risk Assessment'} as const;
type Kind=keyof typeof sources|'unit';
export function PolicyEntityPicker({kind,label,tr,values,onChange,multi=false,required=false}:{kind:Kind;label:string;tr:boolean;values:Pick[];onChange:(values:Pick[])=>void;multi?:boolean;required?:boolean}){
 const [query,setQuery]=useState(''),q=query.trim();
 const path=kind==='unit'?'/api/policy-lifecycle?'+new URLSearchParams({view:'business-units',q}):
  q.length>=2?'/api/search?'+new URLSearchParams({module:sources[kind],q}):null;
 const result=useChoices<RecordSearchPage&{units?:string[];more?:boolean}>(path);
 const choices=(kind==='unit'?(result.data.units||[]).map(unit=>({id:unit,label:unit})):
  (result.data.results||[]).map(r=>({id:r.id,label:r.code+' · '+r.title}))).filter(r=>!values.some(v=>v.id===r.id));
 function choose(id:string){const selected=choices.find(r=>r.id===id);if(selected)onChange(multi?[...values,selected]:[selected]);}
 return <div className="plm-entity"><ChoiceInput label={label} tr={tr} query={query} onQuery={setQuery} choose={choose}
   options={choices.map(v=>({value:v.id,label:v.label}))} pending={result.loading} more={!!(result.data.nextCursor||result.data.more)}
   required={(required&&!values.length)||!!q} requiredMessage={tr?'Listeden bir kayıt seçin.':'Choose a record from the list.'}
   message={kind!=='unit'&&q.length<2?(tr?'Kod veya başlıktan en az iki karakter girin.':'Enter at least two characters of a code or title.'):undefined}
   selection={!multi&&values[0]?{text:values[0].label,clear:()=>onChange([])}:undefined}/>
   {result.error&&<button type="button" onClick={result.retry}>{tr?'Yeniden dene':'Retry'}</button>}
   {!!values.length&&<div className="plm-picked">{values.map(v=><button key={v.id} type="button" aria-label={(tr?'Kaldır · ':'Remove · ')+v.label} onClick={()=>onChange(values.filter(other=>other.id!==v.id))}>{multi?v.label:(tr?'Seçimi kaldır':'Clear selection')} ×</button>)}</div>}
 </div>;
}
export type PolicyPick=Pick;
export function ExceptionFields({tr,form,set}:{tr:boolean;form:Record<string,unknown>;set:(next:Record<string,unknown>)=>void}){
 const kind=(form.scopeKind||'asset') as 'asset'|'vendor'|'unit',scope=form.scopePick as Pick|undefined,controls=(form.controlPicks||[]) as Pick[];
 return <><label>{tr?'Kapsam türü':'Scope type'}<select aria-label={tr?'Kapsam türü':'Scope type'} value={kind}
 onChange={e=>set({...form,scopeKind:e.target.value,scopePick:undefined})}>
 {(['asset','vendor','unit'] as const).map((k,i)=><option key={k} value={k}>{(tr?['Varlık','Tedarikçi','İş Birimi']:['Asset','Vendor','Business unit'])[i]}</option>)}</select></label>
 <PolicyEntityPicker key={kind} tr={tr} kind={kind} required label={tr?'Kapsam kaydı':'Scope record'} values={scope?[scope]:[]} onChange={v=>set({...form,scopePick:v[0]})}/>
 <PolicyEntityPicker tr={tr} kind="control" multi label={tr?'Telafi kontrolleri':'Compensating controls'} values={controls} onChange={v=>set({...form,controlPicks:v})}/></>;
}

export function ExceptionLinks({tr,row}:{tr:boolean;row:{scopeKind?:string;scopeRef?:string;controlRefs?:string[];riskRef?:string}}){
 const directory=useContext(ModuleTrailContext);
 const links=[...(row.controlRefs||[]).map(ref=>({module:sources.control,ref})),...(row.riskRef?[{module:sources.risk,ref:row.riskRef}]:[]),
  ...((row.scopeKind==='asset'||row.scopeKind==='vendor')&&row.scopeRef?[{module:sources[row.scopeKind],ref:row.scopeRef}]:[])];
 if(!links.length)return null;
 return <div className="plm-picked" aria-label={tr?'Bağlı kayıtlar':'Linked records'}>{links.map(({module,ref})=>{
   const target={module,kind:'record' as const,ref,source:'shared-record-link' as const};
   const record=directory&&resolveCoreRecord(directory.rows,target);
   return <button type="button" key={module+ref} onClick={()=>navigateToFornost(target)}>{record?.code||ref}</button>;
 })}</div>;
}
