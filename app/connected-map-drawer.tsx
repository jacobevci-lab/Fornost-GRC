"use client";
import {useEffect,useId,useRef,type ReactNode} from 'react';

export default function MapDrawer({tr,close,children}:{tr:boolean;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null),title=useId();
  useEffect(()=>{
    const dialog=ref.current,opener=document.activeElement;
    dialog?.showModal();
    return ()=>{
      dialog?.close();
      if(opener instanceof HTMLElement&&opener.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});
      else document.querySelector<HTMLElement>('.cm-command .cm-search input, .cm-scroll')?.focus({preventScroll:true});
    };
  },[]);
  return <dialog className="cm-drawer" ref={ref} aria-labelledby={title} onCancel={event=>{event.preventDefault();close()}} onClick={event=>{if(event.target===ref.current){
    const box=ref.current.getBoundingClientRect();
    if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)close();
  }}}>
    <header><h2 id={title}>{tr?'Kayıt ve bağlantı ayrıntıları':'Record and relationship details'}</h2><button type="button" onClick={close} aria-label={tr?'Ayrıntıları kapat':'Close details'} autoFocus>×</button></header>{children}
  </dialog>;
}
