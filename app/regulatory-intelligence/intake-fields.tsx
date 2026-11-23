'use client';
import {useState} from 'react';
import {ChoiceInput} from '../risk-editor-fields';
import {useChoices} from '../workflow-selection-fields';
import type {PlannedTarget} from './domain';

const authorities=[
 ['KVKK','Kişisel Verileri Koruma Kurumu','Personal Data Protection Authority','https://www.kvkk.gov.tr/'],
 ['BDDK','Bankacılık Düzenleme ve Denetleme Kurumu','Banking Regulation and Supervision Agency','https://www.bddk.org.tr/'],
 ['TCMB','Türkiye Cumhuriyet Merkez Bankası','Central Bank of the Republic of Türkiye','https://www.tcmb.gov.tr/'],
 ['SPK','Sermaye Piyasası Kurulu','Capital Markets Board of Türkiye','https://spk.gov.tr/'],
 ['MASAK','Mali Suçları Araştırma Kurulu','Financial Crimes Investigation Board','https://masak.hmb.gov.tr/'],
];
const legislation=[
 ['EU DORA','reg/2022/2554'],['EU NIS2','dir/2022/2555'],['EU AI Act','reg/2024/1689'],
];
export function sourceTemplates(tr:boolean){
 return [
  ...authorities.map(([key,turkish,english,url])=>({key,name:tr?turkish:english,authority:key,jurisdiction:'Türkiye',url,sourceType:'regulator'})),
  ...legislation.map(([key,path])=>({key,name:key,authority:tr?'Avrupa Parlamentosu ve Avrupa Birliği Konseyi':'European Parliament and Council of the European Union',jurisdiction:tr?'Avrupa Birliği':'European Union',url:'https://eur-lex.europa.eu/eli/'+path+'/oj',sourceType:'legislation'}))
 ];
}
type Item={id:string;title:string};
export function TargetPicker({kind,label,tr,values,onChange}:{kind:'framework'|PlannedTarget['type'];label:string;tr:boolean;values:Item[];onChange:(values:Item[])=>void}){
 const [query,setQuery]=useState('');
 const path='/api/regulatory-intelligence?'+new URLSearchParams({targets:kind,q:query.trim(),preliminary:'1'});
 const result=useChoices<{records:Item[];pages?:number}>(path);
 const options=(result.data.records||[]).filter(row=>!values.some(v=>v.id===row.id));
 return <div className="rg-picker">
  <ChoiceInput tr={tr} label={label} options={options.map(r=>({value:r.id,label:r.title}))} query={query} onQuery={setQuery}
   choose={id=>{const row=options.find(v=>v.id===id);if(row)onChange([...values,row]);}} pending={result.loading} more={(result.data.pages??1)>1}
   required={!!query.trim()} requiredMessage={tr?'Listeden bir kayıt seçin veya aramayı temizleyin.':'Choose a record or clear the search.'}/>
  {result.error&&<button type="button" onClick={result.retry}>{tr?'Seçenekler yüklenemedi · Yeniden dene':'Options unavailable · Retry'}</button>}
  {values.length>0&&<div className="risk-pills">{values.map(row=><button type="button" key={row.id} aria-label={(tr?'Kaldır · ':'Remove · ')+row.title} onClick={()=>onChange(values.filter(v=>v.id!==row.id))}>{row.title} ×</button>)}</div>}
 </div>;
}
export function PreliminaryFields({tr,values,onChange}:{tr:boolean;values:PlannedTarget[];onChange:(targets:PlannedTarget[])=>void}){
 const labels={control:tr?'Etkilenen kontroller':'Affected controls',policy:tr?'Etkilenen politikalar':'Affected policies',risk:tr?'Etkilenen riskler':'Affected risks',process:tr?'Etkilenen iş süreçleri':'Affected business processes'};
 return <fieldset className="wide rg-preliminary"><legend>{tr?'Ön Etki Eşleştirmesi (Connected GRC)':'Preliminary impact mapping (Connected GRC)'}</legend>
 {(Object.keys(labels) as PlannedTarget['type'][]).map(type=><TargetPicker key={type} tr={tr} kind={type} label={labels[type]} values={values.filter(v=>v.type===type)} onChange={rows=>onChange([...values.filter(v=>v.type!==type),...rows.map(row=>({type,...row}))])}/>)}</fieldset>;
}
