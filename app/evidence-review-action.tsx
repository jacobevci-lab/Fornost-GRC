"use client";
import {useState} from "react";
import type {ConnectedGrcRow} from "./connected-grc-model";
import {withBasePath} from "./base-path";
import {evidenceReviewerIsIndependent} from "./evidence/intake";

export function EvidenceReviewAction({row,actor,canWrite,tr,refresh}:{row:ConnectedGrcRow;actor:{name?:string;email:string};canWrite:boolean;tr:boolean;refresh:()=>Promise<boolean>}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  if(row.data.status!=="İncelemede")return message?<p role="status">{message}</p>:null;
  const assigned=evidenceReviewerIsIndependent(row.data,actor)&&canWrite;
  const version=Number(row.data.versionNo);
  async function approve(){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const response=await fetch(withBasePath("/api/evidence/review"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,version,expectedUpdatedAt:row.updatedAt})});
      if(!response.ok){
        const code=(await response.json().catch(()=>({}))).code;
        const text=code==="UNVERIFIED_VERSION"?(tr?"Bu sürümün bütünlüğü doğrulanamadı.":"Version integrity could not be verified."):response.status===403?(tr?"Onayı atanan bağımsız inceleyen vermelidir.":"The assigned independent reviewer must approve this evidence."):(tr?"Kayıt değişti. Güncel sürümü tekrar inceleyin.":"The record changed. Review the current version.");
        setMessage(text);await refresh();return;
      }
      const loaded=await refresh();
      setMessage(loaded?(tr?"Kanıt sürümü onaylandı.":"Evidence version approved."):(tr?"Onay kaydedildi. Güncel durumu görmek için sayfayı yenileyin.":"Approval saved. Reload to see the current state."));
    }catch{setMessage(tr?"Onay sonucu doğrulanamadı. Kaydı yenileyin.":"Approval could not be confirmed. Refresh the record.")}finally{setBusy(false)}
  }
  return <section className="ev-review-note">{assigned&&version>0?<button type="button" className="primary" disabled={busy} onClick={approve}>{tr?"Bu sürümü onayla":"Approve this version"} · v{version}</button>:
    <span>{!row.data.reviewer?(tr?"Bağımsız inceleyen atanması bekleniyor.":"Awaiting independent reviewer assignment."):!(version>0)?(tr?"Onay için izlenebilir bir dosya sürümü gerekir.":"A tracked file version is required for approval."):(tr?"Atanan bağımsız inceleyenin onayı bekleniyor.":"Awaiting approval by the assigned independent reviewer.")}</span>}
    {message&&<p role="status">{message}</p>}</section>;
}
