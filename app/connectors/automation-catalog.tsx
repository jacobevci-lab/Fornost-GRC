"use client";
import {useEffect,useState} from "react";
import {ChoiceInput} from "../risk-editor-fields";
import {readAllGrcPages} from "../grc-pagination";
import {requestJsonWithDeadline} from "../bounded-json-request";
import {withBasePath} from "../base-path";
type Control={id:string;ref:string;title:string};
const clean=(value:unknown)=>String(value??"").trim();
const normalized=(value:unknown)=>clean(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
function catalogRows(body: unknown,module:string): Control[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { rows?: unknown }).rows)) return [];
  const seen = new Set<string>();
  const controls: Control[] = [];
  for (const raw of (body as { rows: Array<Record<string, unknown>> }).rows) {
    if (clean(raw.module) !== module) continue;
    let data: Record<string, unknown> = {};
    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
      data = raw.data as Record<string, unknown>;
    } else if (typeof raw.data_json === "string") {
      try {
        const parsed = JSON.parse(raw.data_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
      } catch {}
    }
    const ref = clean(raw.record_code || raw.code || raw.recordCode || raw.id);
    if (!(module==="Kontroller"?/^CTL-\d+$/i:/^AST-\d+$/i).test(ref))continue;
    const key = normalized(ref);
    if (!ref || seen.has(key)) continue;
    seen.add(key);
    controls.push({ ref, id:clean(raw.id), title: clean(data.controlTitle || data.title || data.name || data.objective || ref) });
  }
  return controls.sort((a, b) => a.ref.localeCompare(b.ref, "tr"));
}

export function useAutomationCatalog(active=true){
  const [assets,setAssets]=useState<Control[]>([]),[controls,setControls]=useState<Control[]>([]);
  const [catalogFailed,setCatalogFailed]=useState(false),[catalogRevision,reloadCatalog]=useState(0);
  useEffect(() => {
    if(!active)return;
    const controller = new AbortController();
    readAllGrcPages<Record<string,unknown>>(async cursor=>{
      const {response,body}=await requestJsonWithDeadline(withBasePath("/api/grc?automationChoices=1"+(cursor?"&cursor="+encodeURIComponent(cursor):"")),{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error("catalog");return body as {rows:Record<string,unknown>[];nextCursor?:string|null};
    }).then(rows=>{if(!controller.signal.aborted){setControls(catalogRows({rows},"Kontroller"));setAssets(catalogRows({rows},"Varlık Envanteri"));setCatalogFailed(false);}})
      .catch(()=>{if(!controller.signal.aborted)setCatalogFailed(true)});
    return () => controller.abort();
  }, [active,catalogRevision]);

  return {assets,controls,catalogFailed,retry:()=>reloadCatalog(n=>n+1)};
}
export function SourceAssetField({tr,assetId,assets,choose}:{tr:boolean;assetId:string;assets:Control[];choose:(value:string)=>void}){
  const [assetQuery,searchAsset]=useState("");
  const selected=assets.find(row=>row.id===assetId);
  const matches=assets.filter(row=>normalized(row.ref+" "+row.title).includes(normalized(assetQuery)));
  return <div className="wide"><ChoiceInput tr={tr} label={tr?"İlgili Varlık (AST-xxx)":"Related asset (AST-xxx)"}
    query={assetQuery} onQuery={searchAsset} options={matches.map(row=>({value:row.id,label:row.ref+" · "+row.title}))} choose={choose}/>
    {assetId&&<button type="button" className="ghost" onClick={()=>choose("")}>{selected?selected.ref+" · "+selected.title:(tr?"Seçili varlık":"Selected asset")} ×</button>}
  </div>;
}
