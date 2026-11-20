"use client";
import { useState } from "react";
import { withBasePath } from "../base-path";
import { connectedTitle, type ConnectedGrcRow } from "../connected-grc-model";
import { navigateToFornost } from "../navigation-focus";
import { type RecordIntent } from "./record-assistance";

type Props = { rows: ConnectedGrcRow[]; lang:"tr"|"en"; initialId:string; connected:boolean; draft:boolean; loading:boolean; failed:boolean; retry:()=>void };
type Answer = { answer:string; sources:{id:string;title:string;module:string}[] };

export function RecordAssistant({rows,lang,initialId,connected,draft,loading,failed,retry}:Props) {
  const tr=lang==="tr";
  const [id,setId]=useState(initialId);
  const options=rows.filter(row=>row.module==="Risk Assessment" || row.module==="Kanıtlar");
  const selected=options.find(row=>row.id===id);
  return <section className="settings-card" aria-label="Ask Fornost">
    <h2>{tr?"Bir kayıt üzerinde çalış":"Work with a record"}</h2>
    <label className="setting-field">{tr?"Risk veya kanıt kaydı":"Risk or evidence record"}
      <select value={selected?.id||""} onChange={e=>setId(e.target.value)} disabled={loading||failed}>
        <option value="">{tr?"Kayıt seçin":"Select a record"}</option>
        {options.map(row=><option value={row.id} key={row.id}>{row.module==="Kanıtlar"?(tr?"Kanıt":"Evidence"):"Risk"} · {connectedTitle(row)} · {row.code||row.id}</option>)}
      </select>
    </label>
    {loading && <p role="status">{tr?"Kayıtlar yükleniyor…":"Loading records…"}</p>}
    {failed && <button className="ghost" onClick={retry}>{tr?"Kayıtları yeniden yükle":"Retry loading records"}</button>}
    {!failed&&!loading&&!options.length&&<p>{tr?"Erişebildiğiniz risk veya kanıt kaydı bulunamadı.":"No accessible risk or evidence records were found."}</p>}
    {selected && <RecordActions key={selected.id+lang} id={selected.id} lang={lang} draft={draft} connected={connected}/>}
  </section>;
}

function RecordActions({id,lang,draft,connected}:Pick<Props,"lang"|"draft"|"connected">&{id:string}) {
  const tr=lang==="tr";
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(""), [answer,setAnswer]=useState<Answer|null>(null);
  async function ask(intent:RecordIntent) {
    if (busy) return;
    setBusy(true); setAnswer(null); setMessage("");
    try {
      const response=await fetch(withBasePath("/api/ai/chat"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({recordTask:{recordId:id,intent,locale:lang}})});
      const data=await response.json();
      if (!response.ok) {
        const messages:Record<string,string>={
          RECORD_UNAVAILABLE:tr?"Kayıt kullanılamıyor veya modelin veri kapsamı dışında.":"The record is unavailable or outside the model’s data scope.",
          LICENSE_REQUIRED:tr?"Bu işlem için paket yükseltmesi gerekiyor.":"This action requires a higher edition.",
          AI_NOT_CONFIGURED:tr?"Yöneticiniz AI Ayarları’ndan bir model etkinleştirdiğinde bu işlemi kullanabilirsiniz.":"An administrator can enable a model in AI Settings to use this feature.",
        };
        throw Error(messages[data.code]||data.error||(tr?"İstek tamamlanamadı.":"The request could not be completed."));
      }
      setAnswer(data);
    } catch(error) {setMessage(error instanceof Error?error.message:(tr?"İstek başarısız.":"Request failed."));}
    finally {setBusy(false);}
  }
  return <div>
    <div className="form-actions">
      <button type="button" className="primary" disabled={busy} onClick={()=>ask("summary")}>{tr?"Kaydı özetle":"Summarize record"}</button>
      {draft&&<button type="button" className="ghost" disabled={busy} onClick={()=>ask("request")}>{tr?"Kanıt talebi taslağı hazırla":"Draft an evidence request"}</button>}
      {connected&&<button type="button" className="ghost" disabled={busy} onClick={()=>ask("connections")}>{tr?"Bağlantıları ve kontrol önerilerini incele":"Analyze links and suggested controls"}</button>}
    </div>
    <p role="status">{busy?(tr?"Yanıt hazırlanıyor…":"Preparing response…"):message}</p>
    {answer && <div><p style={{whiteSpace:"pre-wrap"}}>{answer.answer}</p>{answer.sources.length>0&&<><strong>{tr?"Yanıtta kullanılan kayıtlar":"Records cited in the answer"}</strong><ul>{answer.sources.map(source=><li key={source.id}><button type="button" className="ghost" onClick={()=>navigateToFornost({module:source.module,kind:"record",ref:source.id,filter:{recordRef:source.id}})}>{source.title} · {source.id}</button></li>)}</ul></>}</div>}
  </div>;
}
