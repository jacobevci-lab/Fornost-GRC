"use client";
import { aiRecordTarget, type AiRecordKind } from './ai-record-navigation';

/** Opens the existing governed view; API authorization and missing-record handling stay in that view. */
export function AiRelatedRecordLink({kind,recordRef,label,disabled=false}:{kind:AiRecordKind;recordRef:string|null|undefined;label:string;disabled?:boolean}) {
  const target=aiRecordTarget(kind,recordRef);
  if(!target)return null;
  return <button type="button" className="ai-related-record-link" disabled={disabled} title={target.recordFocus.ref} onClick={()=>window.dispatchEvent(new CustomEvent('fornost:open-ai',{detail:target}))}>{label}</button>;
}
