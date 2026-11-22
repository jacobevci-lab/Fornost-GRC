"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import type {ConnectedGrcRow} from "./connected-grc-model";
import {withBasePath} from "./base-path";
import {riskRecordOptions,type RiskRecordOptions} from "./risk-record-options";
import {navigateToFornost} from "./navigation-focus";

type Plan={id:string;code:string;biaRef:string};
type Snapshot={plans:Map<string,Plan[]>;dateFormat:string;allowed:boolean};
type Context={snapshot:Snapshot|null;failed:boolean;retry:()=>void;assets:RiskRecordOptions;create?: (row:ConnectedGrcRow)=>void};
export const BiaRegisterContext=createContext<Context|null>(null);
export function BiaRegisterProvider({rows,create,children}:{rows:ConnectedGrcRow[];create?:Context["create"];children:ReactNode}){
  const assets=useMemo(()=>riskRecordOptions(rows,"Varlık Envanteri"),[rows]);
  const [attempt,setAttempt]=useState(0),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      setFailed(false);setSnapshot(null);
      const plans=new Map<string,Plan[]>();
      let cursor="";
      for(;;){
        const r=await fetch(withBasePath("/api/grc/bia-context?after="+encodeURIComponent(cursor)),{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(!r.ok)throw Error("BIA context");
        const page=await r.json();
        if(!Array.isArray(page.plans)||typeof page.allowed!=="boolean")throw Error("BIA context");
        for(const plan of page.plans as Plan[]){
          const key=plan.biaRef.trim().toLowerCase(),list=plans.get(key)||[];
          list.push(plan);plans.set(key,list);
        }
        if(!page.next){if(!controller.signal.aborted)setSnapshot({plans,dateFormat:page.dateFormat,allowed:page.allowed});return;}
        if(typeof page.next!=="string"||page.next<=cursor)throw Error("BIA context cursor");
        cursor=page.next;
      }
    }
    void load().catch(()=>{if(!controller.signal.aborted)setFailed(true)});
    return ()=>controller.abort();
  },[attempt]);
  return <BiaRegisterContext.Provider value={{assets,create,snapshot,failed,retry:()=>setAttempt(a=>a+1)}}>{children}</BiaRegisterContext.Provider>;
}
export function BiaPlanCell({row,tr}:{row:ConnectedGrcRow;tr:boolean}){
  const context=useContext(BiaRegisterContext);
  if(context?.failed)return <button type="button" onClick={context.retry}>{tr?"Bağlantıları yeniden yükle":"Retry plan links"}</button>;
  if(!context?.snapshot?.allowed)return <>—</>;
  const refs=new Set([row.id,row.code].filter((x):x is string=>!!x).map(x=>x.toLowerCase()));
  const plans=[...refs].flatMap(key=>context.snapshot!.plans.get(key)||[]);
  return <div className="asset-link-counts">{plans.length?plans.map(p=><button type="button" key={p.id}
    onClick={()=>navigateToFornost({module:"İş Sürekliliği",kind:"continuity-plan",ref:p.id,source:"bia-register"})}>{p.code}</button>):
    context.create?<button type="button" onClick={()=>context.create?.(row)}>{tr?"+ Plan Oluştur":"+ Create plan"}</button>:<>—</>}</div>;
}
export function BiaScope({enabled,...props}:Parameters<typeof BiaRegisterProvider>[0] & {enabled:boolean}){
  return enabled?<BiaRegisterProvider {...props}/>:props.children;
}
