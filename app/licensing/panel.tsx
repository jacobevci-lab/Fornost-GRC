"use client";
import { useEffect, useState, type ChangeEvent } from "react";
import { withBasePath } from "../base-path";
import type { LicenseInfo } from "./store";

type Info = LicenseInfo | {status: "internal"};
export function LicensePanel({lang}:{lang:"tr"|"en"}) {
  const tr = lang === "tr";
  const [info,setInfo] = useState<Info | null>(null);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [attempt,retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath("/api/license"), {cache:"no-store",signal:controller.signal})
      .then(async response => { if (!response.ok) throw Error(); const data=await response.json(); if (!controller.signal.aborted) setInfo(data); })
      .catch(() => { if (!controller.signal.aborted) setMessage(tr?"Lisans bilgisi okunamadı.":"Could not load the license."); });
    return () => controller.abort();
  },[tr,attempt]);

  async function choose(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value="";
    if (!file || busy) return;
    const errors:Record<string,string>={
      invalid:tr?"Dosya veya lisans imzası geçersiz.":"Invalid license file or signature.",
      installation:tr?"Lisans başka bir kurulum için düzenlenmiş.":"This license is for another installation.",
      expired:tr?"Bu lisansın süresi dolmuş.":"This license has expired.",
      revision:tr?"Daha güncel bir lisans zaten etkin.":"A newer license is already installed.",
    };
    setBusy(true);setMessage("");
    try {
      if (file.size>8192) throw new Error(errors.invalid);
      const response=await fetch(withBasePath("/api/license"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({license:await file.text()})});
      const result=await response.json();
      if (!response.ok) throw new Error(errors[result.code] || (tr?"Lisans yüklenemedi.":"Could not activate the license."));
      setInfo(result);setMessage(tr?"Lisans etkinleştirildi.":"License activated.");
      window.dispatchEvent(new Event("focus"));
    } catch (e) { setMessage(e instanceof Error?e.message:errors.invalid); }
    finally { setBusy(false); }
  }

  const status = {pending:tr?"Etkinleştirme bekleniyor":"Awaiting activation",active:tr?"Etkin":"Active",expired:tr?"Süresi doldu":"Expired",invalid:tr?"Lisans doğrulanamadı":"License verification failed",internal:tr?"Dahili sürüm":"Internal build"};
  return <section className="settings-card" aria-labelledby="license-title">
    <div className="settings-card-head"><div><h3 id="license-title">{tr?"Kurulum lisansı":"Installation license"}</h3>
      {info && <p>{status[info.status]}</p>}</div></div>
    {info && info.status !== "internal" && <>
      <dl><dt>{tr?"Kurulum kimliği":"Installation ID"}</dt><dd><code>{info.installation}</code></dd>
        {info.edition && <><dt>{tr?"Paket":"Edition"}</dt><dd>{info.edition}</dd><dt>{tr?"Kurum":"Organization"}</dt><dd>{info.customer}</dd>
        <dt>{tr?"Geçerlilik sonu (UTC)":"Expires (UTC)"}</dt><dd>{info.expires.slice(0,10)} {info.expires.slice(11,16)}</dd></>}</dl>
      <p>{tr?"Lisans almak veya paketi yükseltmek için kurulum kimliğini paylaşın.":"Include your installation ID when requesting or upgrading a license."} <a href="mailto:sales@fornostsecurity.com">sales@fornostsecurity.com</a></p>
      <label className="setting-field"><span>{tr?"İmzalı lisans dosyasını yükle":"Upload signed license file"}</span>
        <input type="file" accept=".fornost,text/plain" disabled={busy} onChange={choose}/></label>
    </>}
    <p role="status">{message || (!info && (tr?"Yükleniyor…":"Loading…"))}</p>
    {!info && message && <button type="button" onClick={()=>{setMessage("");retry(x=>x+1);}}>{tr?"Tekrar dene":"Retry"}</button>}
  </section>;
}
