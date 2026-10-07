'use client';
import {useEffect,useRef,type ReactNode} from 'react';

/** Native modal semantics keep keyboard focus in the topmost CAPA dialog. */
export default function FindingDialog({label,busy=false,onClose,dismissOnBackdrop=false,children}:{label:string;busy?:boolean;onClose:()=>void;dismissOnBackdrop?:boolean;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog?.showModal();
  return()=>{
   dialog?.close();
   queueMicrotask(()=>{
    if(previous?.isConnected&&(!document.querySelector('dialog[open]')||previous.closest('dialog[open]')))previous.focus();
   });
  };
 },[]);
 return <dialog ref={ref} className="finding-overlay" aria-label={label} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(dismissOnBackdrop&&!busy&&event.target===event.currentTarget)onClose();}}>{children}</dialog>;
}
