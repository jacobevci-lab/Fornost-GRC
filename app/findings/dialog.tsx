'use client';
import {useEffect,useRef,type ReactNode} from 'react';

/** Native modal semantics keep keyboard focus in the topmost workflow dialog. */
export default function FindingDialog({label,busy=false,onClose,dismissOnBackdrop=false,className="finding-overlay",children}:{label:string;busy?:boolean;onClose:()=>void;dismissOnBackdrop?:boolean;className?:string;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog?.showModal();
  // Native dialogs can move Tab focus into browser chrome at the last control.
  // Keep sequential keyboard navigation in the current, topmost workflow dialog.
  const keydown=(event:KeyboardEvent)=>{
   if(!dialog||event.defaultPrevented||event.isComposing||event.key!=='Tab'||Array.from(document.querySelectorAll('dialog[open]')).at(-1)!==dialog)return;
   // The shared accessibility layer also makes overflowing form containers
   // tabbable. Their child controls already provide scrolling access, so wrap
   // between actual controls rather than landing on the form container.
   const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]:not(form)')).filter(node=>node.tabIndex>=0&&!node.matches(':disabled,input[type="hidden"]')&&node.getClientRects().length>0);
   const first=controls[0],last=controls.at(-1);
   if(!first){event.preventDefault();dialog.focus();return;}
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  dialog?.addEventListener('keydown',keydown);
  return()=>{
   dialog?.removeEventListener('keydown',keydown);
   dialog?.close();
   queueMicrotask(()=>{
    if(previous?.isConnected&&(!document.querySelector('dialog[open]')||previous.closest('dialog[open]')))previous.focus();
   });
  };
 },[]);
 return <dialog ref={ref} className={className} tabIndex={-1} aria-label={label} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(dismissOnBackdrop&&!busy&&event.target===event.currentTarget)onClose();}}>{children}</dialog>;
}
