'use client';
import {useState} from 'react';
import {useChoices} from '../workflow-selection-fields';
import {ChoiceInput} from '../risk-editor-fields';
import type {RecordSearchPage} from '../record-search-store';

type Draft=Record<string,string|boolean>;
const kinds=[
 ['assetRefs','Varlık Envanteri','Varlık referansları','Asset references'],
 ['riskRef','Risk Assessment','Risk referansı','Risk reference'],
 ['biaRef','BIA','BIA referansı','BIA reference'],
 ['vendorRef','Tedarikçiler','Tedarikçi referansı','Vendor reference']
] as const;
function Reference({kind,tr,form,update}:{kind:typeof kinds[number];tr:boolean;form:Draft;update:(value:Draft)=>void}){
 const [field,module,t,e]=kind,[query,setQuery]=useState(''),[labels,setLabels]=useState<Record<string,string>>({});
 const multi=field==='assetRefs',ids=String(form[field]||'').split(', ').filter(Boolean),q=query.trim();
 const result=useChoices<RecordSearchPage>(q.length>=2?'/api/search?'+new URLSearchParams({module,q}):null);
 const rows=(result.data.results||[]).filter(row=>!ids.includes(row.id));
 const save=(next:string[])=>update({...form,[field]:next.join(', ')});
 function choose(id:string){
  const row=rows.find(r=>r.id===id);if(!row)return;
  setLabels(old=>({...old,[id]:row.code+' · '+row.title}));save(multi?[...ids,id]:[id]);
 }
 return <div className="ic-entity"><ChoiceInput label={tr?t:e} tr={tr} query={query} onQuery={setQuery}
  choose={choose} options={rows.map(row=>({value:row.id,label:row.code+' · '+row.title}))} pending={result.loading} more={!!result.data.nextCursor}
  message={q.length<2?(tr?'Kod veya başlıktan en az iki karakter girin.':'Enter at least two characters of a code or title.'):undefined}
  selection={!multi&&ids.length?{text:labels[ids[0]]||ids[0],clear:()=>save([])}:undefined}
  required={multi&&!ids.length||!!q} requiredMessage={tr?'Listeden kayıt seçin veya aramayı temizleyin.':'Choose a record or clear the search.'}/>
  {result.error&&<button type="button" onClick={result.retry}>{tr?'Kayıtlar alınamadı · Tekrar dene':'Records unavailable · Retry'}</button>}
  {multi&&<div className="ic-chips">{ids.map(id=><button key={id} type="button" onClick={()=>save(ids.filter(x=>x!==id))} aria-label={(tr?'Kaldır · ':'Remove · ')+(labels[id]||id)}>{labels[id]||id} ×</button>)}</div>}
 </div>;
}
export function IncidentReferenceSearch({tr,form,setForm}:{tr:boolean;form:Draft;setForm:(v:Draft)=>void}){
 return <>{kinds.map(kind=><Reference key={kind[0]} kind={kind} tr={tr} form={form} update={setForm}/>)}</>;
}
