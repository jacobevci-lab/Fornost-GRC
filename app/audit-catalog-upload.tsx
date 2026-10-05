'use client';
import {useEffect,useRef,useState} from 'react';
import {MAX_CATALOG_BYTES,validateCatalogImport,type AuditCatalogImport} from './audit-catalog-import';
export function AuditCatalogUpload({lang,value,onChange}:{lang:'tr'|'en';value:AuditCatalogImport|null;onChange:(value:AuditCatalogImport|null)=>void}){
 const [error,setError]=useState(''),generation=useRef(0);const tr=lang==='tr';
 useEffect(()=>()=>{generation.current++;},[]);
 return <fieldset className="wide"><legend>{tr?'Kendi standart kataloğun':'Your standard catalog'}</legend>
 <p>{tr?'Lisanslı veya kurumunuza özel maddeleri JSON olarak yükleyin. Bu dosya yeni denetimde hazır şablonun yerine kullanılır.':'Upload licensed or organization-specific requirements as JSON. This replaces the built-in template for the new audit.'}</p>
 <input type="file" accept=".json,application/json" aria-label={tr?'Katalog dosyası':'Catalog file'} onChange={async e=>{const ticket=++generation.current;const file=e.target.files?.[0];onChange(null);setError('');if(!file)return;try{if(file.size>MAX_CATALOG_BYTES)throw new Error('Maximum 2 MB');const pack=validateCatalogImport(JSON.parse(await file.text()),false);if(ticket===generation.current)onChange({...pack,rightsConfirmed:false});}catch(err){if(ticket===generation.current)setError(String(err));}e.target.value='';}}/>
 {error&&<p role="alert">{error}</p>}
 {value&&<><p><strong>{value.name} · {value.version}</strong> — {value.requirements.length} {tr?'madde':'requirements'}</p><p><a href={value.source} target="_blank" rel="noreferrer">{tr?'Kaynak':'Source'}</a></p><label><input type="checkbox" checked={value.rightsConfirmed} onChange={e=>onChange({...value,rightsConfirmed:e.target.checked})}/>{tr?'Bu içeriği bu kurulumda kullanma hakkımız var.':'We have the right to use this content in this installation.'}</label><button type="button" onClick={()=>{generation.current++;onChange(null);}}>{tr?'Dosyayı kaldır':'Remove file'}</button></>}
 <details><summary>{tr?'Dosya biçimi':'File format'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({name:'Organization catalog',version:'1.0',source:'https://example.com/standard',requirements:[{ref:'ORG-01',title:'Access review',category:'Access',statement:'Review the approved access list and record decisions.',assessment:'Compare current access with approvals.'}]},null,2)}</pre></details>
 </fieldset>;
}
