"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from './base-path';

/** Keep responses bound to the exact navigation target; cancellation and retry preserve form drafts. */
export function useWorkflowRecords<T>(path:string,focus:{kind:string;ref:string}|null) {
  const url=withBasePath(path+(focus?'?'+new URLSearchParams({focusKind:focus.kind,focusId:focus.ref}):''));
  const [state,setState]=useState<{url:string;data:T|null;loading:boolean;error:boolean}>({url:'',data:null,loading:true,error:false});
  const pending=useRef<AbortController|null>(null),generation=useRef(0);
  const request=useCallback(()=>{
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const current=++generation.current;let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort()},15000);
    return fetch(url,{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error('read');
        return await response.json() as T;
      })
      .then(data=>{
        if(current!==generation.current||controller.signal.aborted)return null;
        setState({url,data,loading:false,error:false});return data;
      })
      .catch(()=>{
        if(current===generation.current&&(!controller.signal.aborted||timedOut))setState({url,data:null,loading:false,error:true});
        return null;
      })
      .finally(()=>clearTimeout(timer));
  },[url]);
  const cancel=useCallback(()=>{++generation.current;pending.current?.abort()},[]);
  useEffect(()=>{void request();return cancel},[request,cancel]);
  const reload=useCallback(()=>{
    setState(previous=>({url,data:previous.url===url?previous.data:null,loading:true,error:false}));
    return request();
  },[request,url]);
  const current=state.url===url;
  return {data:current?state.data:null,loading:!current||state.loading,error:current&&state.error,ready:current&&!state.loading&&!state.error&&state.data!==null,reload};
}
