'use client';
import {useEffect,useRef,useState} from 'react';
import {MAX_CATALOG_BYTES,validateCatalogImport,type AuditCatalogImport} from './audit-catalog-import';
export function AuditCatalogUpload({lang,value,onChange}:{lang:'tr'|'en';value:AuditCatalogImport|null;onChange:(value:AuditCatalogImport|null)=>void}){
 const [error,setError]=useState(''),generation=useRef(0);const tr=lang==='tr';
 useEffect(()=>()=>{generation.current++;},[]);
 const picker=useRef<HTMLInputElement>(null);
 async function read(file?:File) {
   if(!file)return;
   const ticket=++generation.current;onChange(null);setError('');
   try{
     if(file.size>MAX_CATALOG_BYTES)throw new Error();
     const pack=validateCatalogImport(JSON.parse(await file.text()),false);
     if(ticket===generation.current)onChange({...pack,rightsConfirmed:false});
   }catch{if(ticket===generation.current)setError(tr?'JSON dosyasını, madde kodlarını ve 2 MB boyut sınırını kontrol edin.':'Check the JSON file, requirement codes and 2 MB size limit.');}
 }
 return <details className="wide audit-catalog-drop"><summary>{tr?'+ Özel / lisanslı standart kataloğu (JSON) yükle':'+ Upload custom / licensed standard catalog (JSON)'}{value&&' · '+value.name}</summary>
 <p>{tr?'Yüklediğiniz katalog bu denetimin maddelerini belirler.':'The uploaded catalog supplies the requirements for this audit.'}</p>
 <input hidden ref={picker} type="file" accept=".json,application/json" aria-label={tr?'Katalog dosyası':'Catalog file'} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void read(file);}}/>
 <button type="button" className="audit-file-drop" onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void read(e.dataTransfer.files[0]);}}>{tr?'JSON dosyasını buraya sürükleyin veya dosya seçin':'Drop a JSON file here or choose a file'}</button>
 {error&&<p role="alert">{error}</p>}
 {value&&<><p><strong>{value.name} · {value.version}</strong> — {value.requirements.length} {tr?'madde':'requirements'}</p><p><a href={value.source} target="_blank" rel="noreferrer">{tr?'Kaynak':'Source'}</a></p><label><input type="checkbox" checked={value.rightsConfirmed} onChange={e=>onChange({...value,rightsConfirmed:e.target.checked})}/>{tr?'Bu içeriği bu kurulumda kullanma hakkımız var.':'We have the right to use this content in this installation.'}</label><button type="button" onClick={()=>{generation.current++;onChange(null);}}>{tr?'Dosyayı kaldır':'Remove file'}</button></>}
 <details><summary>{tr?'Dosya biçimi':'File format'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({name:'Organization catalog',version:'1.0',source:'https://example.com/standard',requirements:[{ref:'ORG-01',title:'Access review',category:'Access',statement:'Review the approved access list and record decisions.',assessment:'Compare current access with approvals.'}]},null,2)}</pre></details>
 </details>;
}
