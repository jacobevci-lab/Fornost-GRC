"use client";
import {useEffect,useRef} from 'react';
export function useRecordDialog(open:boolean,onClose:()=>void){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  if(!open||!dialog)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(node=>!node.matches(':disabled')&&node.getClientRects().length>0);
  const keydown=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.isComposing)return;
   const top=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(node=>node.getClientRects().length>0).at(-1);
   if(top!==dialog)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
   if(event.key!=='Tab')return;
   const fields=controls(),first=fields[0],last=fields.at(-1);
   if(!first){event.preventDefault();dialog.focus();return;}
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  const firstField=controls().find(node=>['INPUT','SELECT','TEXTAREA'].includes(node.tagName));
  (firstField??controls()[0]??dialog).focus({preventScroll:true});
  dialog.addEventListener('keydown',keydown);
  return()=>{dialog.removeEventListener('keydown',keydown);if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[open,onClose]);
 return ref;
}
