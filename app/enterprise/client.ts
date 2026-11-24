'use client';
import {useCallback,useEffect,useState} from 'react';
import {withBasePath} from '../base-path';
import type {DirectoryRule} from './directory';
import type {Scope,Entity} from './scope';
export const labels={
 risk:['Risk','Risk'],asset:['Varlık','Asset'],bia:['BIA','BIA'],vendor:['Tedarikçi','Supplier'],control:['Kontrol','Control'],policy:['Politika','Policy'],audit:['Denetim','Audit'],finding:['Bulgu','Finding'],incident:['Olay','Incident'],ai:['AI Sistemi','AI system'],evidence:['Kanıt','Evidence']
};
export type Kind=keyof typeof labels;
export type Identity={id:string;name:string;email:string;platformRole:string;role:string|null;memberships:string;revision:string|null};
export type Access={scope:Scope;entities:Entity[];users:Identity[];manage:boolean;readable:Kind[];writable:Kind[];self:string};
export type Directory={rules:DirectoryRule[];revision:string;tokenRevision:string};
export async function request<T>(path:string,body?:object,method='POST',token?:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch(withBasePath('/api/'+path),{method:body?method:'GET',cache:'no-store',signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(String(response.status));return response.json();
}
export function useData<T>(path:string){
 const [tick,setTick]=useState(0),[result,setResult]=useState<{path:string;data?:T;error?:boolean}>();
 const reload=useCallback(()=>setTick(v=>v+1),[]);
 useEffect(()=>{const c=new AbortController();request<T>(path,undefined,'GET',undefined,c.signal).then(data=>{if(!c.signal.aborted)setResult({path,data})}).catch(()=>{if(!c.signal.aborted)setResult({path,error:true})});return ()=>c.abort()},[path,tick]);
 return {data:result?.path===path?result.data:undefined,error:result?.path===path&&result.error,reload};
}
export function issue(tr:boolean,err:unknown){
 const code=err instanceof Error?err.message:'';
 if(code==='409')return tr?'Kayıt değişti. Yenileyip yeniden deneyin.':'Record changed. Refresh and try again.';
 if(code==='403')return tr?'Bu kapsamda işlem yetkiniz yok.':'You lack permission in this scope.';
 if(code==='401')return tr?'Kimlik doğrulanamadı.':'Authentication failed.';
 return tr?'İşlem tamamlanamadı. Alanları ve bağlantıyı kontrol edin.':'Could not complete the request. Check the fields and connection.';
}
