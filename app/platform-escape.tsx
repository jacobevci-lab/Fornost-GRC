"use client";
import {useEffect} from 'react';

/** Explicit dismissal boundaries reuse each surface's own close action. */
export function installPlatformEscape(doc:Document=document){
 const visible=(node:HTMLElement)=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[inert]');
 const stack=(node:HTMLElement)=>{
  const levels:number[]=[];
  for(let item:HTMLElement|null=node;item;item=item.parentElement){
   const css=getComputedStyle(item);
   if(css.zIndex!=='auto'||css.transform!=='none'||Number(css.opacity)<1||css.isolation==='isolate')levels.unshift(Number.parseInt(css.zIndex,10)||0);
  }
  return levels;
 };
 const top=(nodes:HTMLElement[])=>nodes.sort((a,b)=>{
  if(a.contains(b))return -1;if(b.contains(a))return 1;
  const aa=stack(a),bb=stack(b);
  for(let i=0;i<Math.max(aa.length,bb.length);i++){const delta=(aa[i]||0)-(bb[i]||0);if(delta)return delta;}
  return a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;
 }).at(-1);
 const key=(event:KeyboardEvent)=>{
  if(event.key!=='Escape')return;
  if(event.defaultPrevented||event.isComposing){event.stopImmediatePropagation();return;}
  const native=doc.activeElement?.closest<HTMLDialogElement>('dialog:modal')||top(Array.from(doc.querySelectorAll<HTMLDialogElement>('dialog:modal')).filter(visible));
  const layers=Array.from(doc.querySelectorAll<HTMLElement>('[data-escape-layer],[role="dialog"]')).filter(node=>visible(node)&&(!native||native.contains(node)));
  const layer=top(layers);
  const disclosure=event.target instanceof Element?event.target.closest<HTMLDetailsElement>('details[open]'):null;
  if(disclosure&&(!layer||layer.contains(disclosure))&&(!native||native.contains(disclosure))){
   event.preventDefault();event.stopImmediatePropagation();if(!event.repeat){disclosure.open=false;disclosure.querySelector('summary')?.focus();}return;
  }
  // Native dialogs retain their cancel handlers and busy guards. Prevent legacy
  // document listeners from dismissing a second, underlying surface as well.
  if(!layer){if(native){event.stopImmediatePropagation();if(event.repeat)event.preventDefault();}return;}
  event.preventDefault();event.stopImmediatePropagation();
  if(event.repeat)return;
  const close=layer.matches('[data-escape-close]')?layer: Array.from(layer.querySelectorAll<HTMLElement>('[data-escape-close]')).find(node=>node.closest('[data-escape-layer]')===layer);
  if(close&&visible(close)&&!close.matches(':disabled')&&close.getAttribute('aria-disabled')!=='true')close.click();
 };
 doc.defaultView?.addEventListener('keydown',key,true);
 return()=>doc.defaultView?.removeEventListener('keydown',key,true);
}

export default function PlatformEscape(){useEffect(()=>installPlatformEscape(),[]);return null;}
