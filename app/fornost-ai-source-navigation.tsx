"use client";

import { useEffect } from "react";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./fornost-ai-source-navigation.css";

type FilterKey="recordRef"|"riskRef"|"controlRef"|"evidenceRef"|"findingRef"|"ruleRef"|"sourceRef";
type Target={module:string;ref:string;filterKey:FilterKey};
const summaryIds=new Set(["CA-SUMMARY","CA-GOVERNANCE-SUMMARY","EVIDENCE-LINEAGE-SUMMARY"]);
const cache=new Map<string,Target|null>();
const selector=".fornost-ai-message footer span";

const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();

async function resolveSource(sourceId:string){
 if(cache.has(sourceId))return cache.get(sourceId)||null;
 try{
  const response=await fetch(withBasePath(`/api/ai/source-target?sourceId=${encodeURIComponent(sourceId)}`),{cache:"no-store",headers:{accept:"application/json"}});
  if(!response.ok){cache.set(sourceId,null);return null}
  const body=await response.json() as {target?:Target|null};
  const target=body.target&&clean(body.target.module)&&clean(body.target.ref)&&clean(body.target.filterKey)?body.target:null;
  cache.set(sourceId,target);
  return target;
 }catch{return null}
}

function decorate(root:ParentNode=document){
 for(const node of root.querySelectorAll<HTMLElement>(selector)){
  const sourceId=clean(node.textContent);
  if(!sourceId||summaryIds.has(sourceId)||node.dataset.fornostSourceNavigation==="off")continue;
  node.classList.add("fornost-ai-source-link");
  node.setAttribute("role","button");
  node.tabIndex=0;
  node.dataset.fornostSourceNavigation="candidate";
  node.setAttribute("aria-label",`${node.getAttribute("title")||sourceId} · kaydı aç`);
 }
}

export default function FornostAiSourceNavigation(){
 useEffect(()=>{
  decorate();
  const observer=new MutationObserver((records)=>{for(const record of records)for(const added of Array.from(record.addedNodes))if(added instanceof HTMLElement){decorate(added);if(added.matches(selector))decorate(added.parentElement||document)}});
  observer.observe(document.body,{childList:true,subtree:true});

  const activate=async(node:HTMLElement)=>{
   const sourceId=clean(node.textContent);if(!sourceId||summaryIds.has(sourceId))return;
   if(node.dataset.fornostSourceNavigation==="off")return;
   node.dataset.fornostSourceNavigation="loading";
   const target=await resolveSource(sourceId);
   if(!target){node.dataset.fornostSourceNavigation="off";node.classList.remove("fornost-ai-source-link");node.removeAttribute("role");node.removeAttribute("tabindex");return}
   node.dataset.fornostSourceNavigation="ready";
   navigateToFornost({module:target.module,ref:target.ref,source:"ask-fornost-source",filter:{[target.filterKey]:target.ref}});
  };
  const click=(event:MouseEvent)=>{const node=(event.target as HTMLElement|null)?.closest<HTMLElement>(selector);if(node?.classList.contains("fornost-ai-source-link")){event.preventDefault();void activate(node)}};
  const keydown=(event:KeyboardEvent)=>{if(event.key!=="Enter"&&event.key!==" ")return;const node=(event.target as HTMLElement|null)?.closest<HTMLElement>(selector);if(node?.classList.contains("fornost-ai-source-link")){event.preventDefault();void activate(node)}};
  document.addEventListener("click",click);
  document.addEventListener("keydown",keydown);
  return()=>{observer.disconnect();document.removeEventListener("click",click);document.removeEventListener("keydown",keydown)};
 },[]);
 return null;
}
