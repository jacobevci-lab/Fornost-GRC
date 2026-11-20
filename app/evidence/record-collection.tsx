"use client";
import { useState } from "react";
import { withBasePath } from "../base-path";
import { sharedCollectionControl } from "./collection-context";

type Rule = {id:string;name:string;controlRefs:string;enabled:boolean};
export function RecordCollection({id,refs,lang}:{id:string;refs:string;lang:"tr"|"en"}) {
  const tr = lang === "tr";
  const [rules,setRules]=useState<Rule[] | null>(null);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function act(run:boolean) {
    if (busy) return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch(withBasePath("/api/evidence-automation"),run?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"run-rule",ruleId:selected,originEvidenceId:id})}:{cache:"no-store"});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error||"");
      if (run) {
        setMessage(data.evidenceId ? (tr?"Toplanan kanıt":"Collected evidence")+" · "+data.evidenceId : (tr?"Toplama başarısız.":"Collection failed.")+" "+(data.errorCode||""));
      } else {
        const matched=(data.rules as Rule[]).filter(rule=>rule.enabled && sharedCollectionControl(rule.controlRefs,refs));
        setRules(matched);setSelected(matched[0]?.id||"");
        if (!matched.length) setMessage(tr?"Kanıt Otomasyonu bölümünde bu kontrole bir kural bağlayın.":"Link a rule to this control in Evidence Automation.");
      }
    } catch(e) { setMessage((e instanceof Error && e.message) || (tr?"İşlem tamamlanamadı.":"The operation could not be completed.")); }
    finally { setBusy(false); }
  }
  return <div>
    {!rules?.length ? <button className="ghost" type="button" disabled={busy} onClick={()=>act(false)}>{tr?"Otomatik toplama kurallarını göster":"Show collection rules"}</button> :
      <><label className="setting-field">{tr?"Toplama kuralı":"Collection rule"}<select disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}>{rules.map(rule=><option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></label>
        <button className="ghost" type="button" disabled={busy||!selected} onClick={()=>act(true)}>{tr?"Kanıt toplamayı başlat":"Start evidence collection"}</button></>}
    <p role="status">{busy?(tr?"İşleniyor…":"Working…"):message}</p>
  </div>;
}
