"use client";

import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {withBasePath} from "./base-path";
import {requestJsonWithDeadline} from "./bounded-json-request";
import {isPalette, paletteIds, paletteName, type Palette} from "./appearance-palettes";
import "./personal-appearance.css";

const endpoint = withBasePath("/api/appearance");

export default function PersonalAppearance({tr, open, onClose}: {
  tr:boolean; open:boolean; onClose:()=>void;
}) {
  const [saved,setSaved] = useState<Palette|null>(null);
  const [draft,setDraft] = useState<Palette|null>(null);
  const [revision,refresh] = useState(0);
  const [loadFailed,setLoadFailed] = useState(false);
  const [saveFailed,setSaveFailed] = useState(false);
  const [saving,setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const writeInFlight = useRef(false);
  const selected = (open && draft) || saved || "default";

  useEffect(()=>{
    const request = new AbortController();
    requestJsonWithDeadline(endpoint,{signal:request.signal,cache:"no-store"}).then(({response,body})=>{
      if (!response.ok || !isPalette(body.palette)) throw new Error("appearance");
      if (!request.signal.aborted) setSaved(body.palette);
    }).catch(()=>{if (!request.signal.aborted) setLoadFailed(true);});
    return ()=>request.abort();
  },[revision]);

  useLayoutEffect(()=>{
    const root = document.documentElement;
    if (selected === "default") delete root.dataset.palette;
    else root.dataset.palette = selected;
    return ()=>{delete root.dataset.palette;};
  },[selected]);

  useLayoutEffect(()=>{
    const element = dialog.current;
    if (!open || !element) return;
    const trigger = document.activeElement;
    element.showModal();
    return ()=>{
      element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({preventScroll:true});
    };
  },[open]);

  function dismiss() {
    if (writeInFlight.current) return;
    setDraft(null);
    setSaveFailed(false);
    onClose();
  }

  async function save() {
    if (writeInFlight.current || !saved || selected === saved) return;
    writeInFlight.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const {response,body} = await requestJsonWithDeadline(endpoint,{
        method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({palette:selected}),
      });
      if (!response.ok || body.palette !== selected) throw new Error("appearance");
      setSaved(selected);
      setDraft(null);
      onClose();
    } catch { setSaveFailed(true); }
    finally { writeInFlight.current=false; setSaving(false); }
  }

  if (!open) return null;
  return createPortal(<dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-title"
    onCancel={event=>{event.preventDefault();dismiss();}}>
    <h2 id="appearance-title">{tr?"Görünüm":"Appearance"}</h2>
    <p>{tr?"Temayı seçerek çalışma alanında önizleyin. Kaydettiğiniz tercih hesabınızda kullanılır.":"Select a theme to preview it in your workspace. Save it to use it across your account."}</p>
    <fieldset disabled={saving || saved===null}>
      <legend>{tr?"Renk teması":"Color theme"}</legend>
      <div className="appearance-options">{paletteIds.map(id=><label key={id}>
        <input type="radio" name="appearance-palette" value={id} checked={selected===id}
          onChange={()=>{setDraft(id);setSaveFailed(false);}}/>
        <span className="appearance-card">
          <span className="appearance-sample" data-sample={id} aria-hidden="true"><i/><b/><span/><em/></span>
          <span className="appearance-caption">{paletteName(id,tr)} <b aria-hidden="true">✓</b></span>
        </span>
      </label>)}</div>
    </fieldset>
    {loadFailed && <p role="alert">{tr?"Tema tercihi yüklenemedi.":"Could not load your theme."} <button type="button" onClick={()=>{setLoadFailed(false);refresh(v=>v+1);}}>{tr?"Yeniden dene":"Retry"}</button></p>}
    {!loadFailed && saved===null && <p role="status">{tr?"Tercih yükleniyor…":"Loading preference…"}</p>}
    {saveFailed && <p role="alert">{tr?"Tema kaydı doğrulanamadı. Tekrar deneyin.":"Could not confirm the saved theme. Please retry."}</p>}
    <footer><button type="button" disabled={saving} onClick={dismiss}>{tr?"Vazgeç":"Cancel"}</button>
      <button className="primary" type="button" disabled={saving || saved===null || selected===saved} onClick={save}>
        {saving?(tr?"Kaydediliyor…":"Saving…"):(tr?"Kaydet":"Save")}
      </button></footer>
  </dialog>,document.body);
}
