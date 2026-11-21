'use client';
import {useEffect,useState} from 'react';
import {withBasePath} from '../base-path';

export async function postureRequest<T>(params:Record<string,string>,signal?:AbortSignal,body?:object):Promise<T>{
  const response=await fetch(withBasePath('/api/framework-posture')+'?'+new URLSearchParams(params),{
    signal,cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})
  });
  if(!response.ok)throw new Error(String(response.status));
  return response.json();
}
export function usePosture<T>(params:Record<string,string>|null,refresh=0,keepDuringRefresh=false):{data?:T;error?:string} {
  const query=params?JSON.stringify(params):'';
  const key=JSON.stringify([query,refresh]);
  const [result,setResult]=useState<{key:string;query:string;data?:T;error?:string}>();
  useEffect(()=>{
    if(!query)return;
    const controller=new AbortController();
    postureRequest<T>(JSON.parse(query),AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])).then(data=>{
      if(!controller.signal.aborted)setResult({key,query,data});
    }).catch(e=>{if(!controller.signal.aborted)setResult({key,query,error:String(e.message)});});
    return ()=>controller.abort();
  },[query,key]);
  return result && (result.key===key || (keepDuringRefresh && result.query===query && result.data)) ? result : {};
}
