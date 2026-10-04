"use client";
import { useState } from "react";
import { withBasePath } from "./base-path";
export default function UserSessionControl({userId,email,lang,onRevoked,disabled=false}:{userId:string;email:string;lang:"tr"|"en";onRevoked:(message:string)=>void;disabled?:boolean}){
  const tr=lang==="tr",[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function revoke(){
    if(busy||disabled)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(withBasePath("/api/users/sessions"),{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({userId}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(!response.ok||body.ok!==true)throw new Error(tr?"Oturumlar sonlandırılamadı. Yeniden deneyin.":"Sessions could not be ended. Please retry.");
      const message=tr?`${email}: yerel oturumlar sonlandırıldı. Kullanıcı tekrar giriş yapabilir.`:`${email}: local sessions ended. The user can sign in again.`;
      if(body.currentSessionRevoked){window.dispatchEvent(new Event("focus"));}
      else onRevoked(message);
    }catch{setError(tr?"Oturum sonlandırma sonucu doğrulanamadı. Tekrar deneyin veya erişim geçmişini kontrol edin.":"Session termination could not be verified. Retry or check access history.");}
    finally{setBusy(false);}
  }
  return <details className="local-user-sessions"><summary>{tr?"Oturum güvenliği":"Session security"}</summary><p>{tr?`${email} kullanıcısının tüm yerel oturumları kapatılır. Hesabı, rolü ve modül izinleri korunur. Harici SSO oturumları kimlik sağlayıcısında yönetilir.`:`End all local sessions for ${email}. The account, role and module permissions are unchanged. Manage external SSO sessions at the identity provider.`}</p><button type="button" disabled={busy||disabled} onClick={()=>void revoke()}>{busy?(tr?"Sonlandırılıyor…":"Ending sessions…"):(tr?"Tüm Yerel Oturumları Sonlandır":"End All Local Sessions")}</button>{error&&<p role="alert">{error}</p>}</details>;
}
