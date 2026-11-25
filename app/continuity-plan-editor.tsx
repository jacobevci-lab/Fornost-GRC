"use client";
import {useMemo,useState,type FormEvent} from "react";
import {EntityField,entity} from "./asset-inventory-fields";
import {DirectoryPersonCombobox} from "./directory-person-combobox";
import {hasRecoveryTarget} from "./bia-recovery";
import type {ConnectedGrcRow} from "./connected-grc-model";

export const frequencies={semiannual:["6 Ayda Bir","Every six months"],annual:["Yıllık","Annual"],"post-event":["Olay Sonrası","After an event"]} as const;
export function newPlan(email:string){
  return {name:"",process:"",biaRef:"",criticality:"",owner:email,reviewer:"",crisisLead:"",rtoHours:"",rpoHours:"",mtpdHours:"",
    dependencies:"",recoveryStrategy:"",communicationPlan:"",alternateSite:"",supplierDependencies:"",minimumStaff:"2",
    exerciseFrequency:"",nextExerciseDate:"",reviewDate:new Date(Date.now()+365*86400000).toISOString().slice(0,10),
    assetRefs:[] as string[],supplierRefs:[] as string[],planId:"",expectedUpdatedAt:"",biaMode:""};
}
export type PlanDraft=ReturnType<typeof newPlan>;
const linkedRefs=(v:unknown):string[]=>Array.isArray(v)?[...new Set(v.filter((ref):ref is string=>typeof ref==="string"&&!!ref.trim()))]:[];
export function biaValues(row:ConnectedGrcRow){
  const d=row.data,level=String(d.criticality||"").trim().toLowerCase(),hours=(v:unknown)=>hasRecoveryTarget(v)?String(v):"";
  const levels:Record<string,string>={kritik:"critical","yüksek":"high",orta:"medium","düşük":"low",critical:"critical",high:"high",medium:"medium",low:"low"};
  return {biaRef:row.code||row.id,biaMode:"record",process:String(d.process||""),criticality:levels[level]||"",
    rtoHours:hours(d.rto),rpoHours:hours(d.rpo),mtpdHours:hours(d.mtpd),recoveryStrategy:String(d.recoveryStrategy||""),
    dependencies:[d.dependencies,d.technologyDependency].filter(Boolean).join("\n"),supplierDependencies:String(d.supplierDependency||""),
    assetRefs:linkedRefs(d.technologyRefs),supplierRefs:linkedRefs(d.supplierRefs)};
}
function ExerciseDate({value,onChange,tr}:{value:string;onChange:(s:string)=>void;tr:boolean}){
  const [display,setDisplay]=useState(()=>value?value.split("-").reverse().join("."):"");
  return <label>{tr?"Sonraki Planlanan Tatbikat Tarihi":"Next planned exercise date"}
    <input name="nextExerciseDate" placeholder={tr?"gg.aa.yyyy":"dd.mm.yyyy"} value={display} maxLength={10}
      onChange={e=>{
        const formatted=e.target.value,iso=formatted.split(".").reverse().join("-");
        const valid=/^\d{2}\.\d{2}\.\d{4}$/.test(formatted)&&Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso;
        e.target.setCustomValidity(!formatted||valid?"":tr?"Tarihi gg.aa.yyyy biçiminde girin.":"Enter the date as dd.mm.yyyy.");
        setDisplay(formatted);onChange(valid?iso:"");
      }}/>
  </label>;
}
type Props={draft:PlanDraft;set:(draft:PlanDraft)=>void;rows:ConnectedGrcRow[];tr:boolean;email:string;creator?:string;
  busy:boolean;notice:string;save:(event:FormEvent)=>void;close:()=>void;text:(key:string)=>string};
export function ContinuityPlanEditor({draft,set,rows,tr,email,creator,busy,notice,save,close,text}:Props){
  const [touched,setTouched]=useState(false);
  const targets=useMemo(()=>rows.filter(r=>["BIA","Varlık Envanteri","Tedarikçiler"].includes(r.module)).map(entity),[rows]);
  const patch=(values:Partial<PlanDraft>)=>set({...draft,...values});
  const t=(a:string,b:string)=>tr?a:b;
  const rpoBad=hasRecoveryTarget(draft.rpoHours)&&hasRecoveryTarget(draft.rtoHours)&&+draft.rpoHours>+draft.rtoHours;
  const rtoBad=hasRecoveryTarget(draft.rtoHours)&&hasRecoveryTarget(draft.mtpdHours)&&+draft.rtoHours>+draft.mtpdHours;
  const roles=["owner","reviewer","crisisLead"] as const;
  const people=roles.map(k=>draft[k].toLowerCase()),sod=people.some((v,i)=>v&&people.indexOf(v)!==i)||Boolean(draft.reviewer&&[email,creator].some(x=>x?.toLowerCase()===draft.reviewer.toLowerCase()));
  function field(k:keyof PlanDraft,label:string,type="text",required=true,minLength?:number){
    const error=k==="rpoHours"&&rpoBad?t("RPO, RTO süresini aşamaz.","RPO cannot exceed RTO."):k==="rtoHours"&&rtoBad?t("RTO, MTPD süresini aşamaz.","RTO cannot exceed MTPD."):"";
    return <div key={k} className={type==="textarea"?"wide":undefined}><label>{label}
      {type==="textarea"?<textarea name={k} required={required} minLength={minLength} value={String(draft[k])} onChange={e=>patch({[k]:e.target.value})}/>:
      <input type={type} name={k} required={required} minLength={minLength} min={type==="number"?(k==="minimumStaff"?1:k==="rpoHours"?0:0.01):undefined}
        step={type==="number"?(k==="minimumStaff"?1:0.01):undefined} value={String(draft[k])} aria-invalid={error?true:undefined} aria-describedby={error?k+"-error":undefined} onChange={e=>patch({[k]:e.target.value})}/>}</label>
      {error&&<small id={k+"-error"} role="alert" className="bia-warning">{error}</small>}</div>;
  }
  function dependencies(key:"assetRefs"|"supplierRefs",module:string,label:string){
    return <EntityField tr={tr} options={targets.filter(r=>r.module===module)} label={label} selected={draft[key]}
      choose={ref=>patch({[key]:[...new Set([...draft[key],ref])]})} remove={ref=>patch({[key]:draft[key].filter(v=>v!==ref)})}/>;
  }
  return <form className="continuity-form" onSubmit={e=>{if(!draft.biaRef||sod||rpoBad||rtoBad){e.preventDefault();setTouched(true);return}save(e)}}>
    <fieldset><legend>{t("1. Plan ve sorumlular","1. Plan and responsibilities")}</legend><div className="form-grid">
      <EntityField tr={tr} options={targets.filter(r=>r.module==="BIA")} label={t("BIA referansı","BIA reference")} selected={draft.biaRef?[draft.biaRef]:[]}
        choose={id=>{const bia=rows.find(r=>r.id===id&&r.module==="BIA");if(bia)patch(biaValues(bia))}} remove={()=>patch({biaRef:"",biaMode:""})}/>
      {touched&&!draft.biaRef&&<small role="alert">{t("Bir BIA kaydı seçin.","Select a BIA record.")}</small>}
      {field("name",t("Plan adı","Plan name"),"text",true,5)}{field("process",t("Kritik süreç","Critical process"),"text",true,3)}
      <label>{t("Kritiklik","Criticality")}<select name="criticality" value={draft.criticality} required onChange={e=>patch({criticality:e.target.value})}><option value="">{t("Seçin","Select")}</option>{["low","medium","high","critical"].map(k=><option key={k} value={k}>{text(k)}</option>)}</select></label>
      {roles.map((key,i)=><DirectoryPersonCombobox key={key} tr={tr} label={[t("Plan sahibi","Plan owner"),t("Bağımsız inceleyen","Independent reviewer"),t("Kriz lideri","Crisis lead")][i]}
        value={draft[key]} reviewer={key==="reviewer"} choose={value=>patch({[key]:value})} exclude={[...roles.filter(k=>k!==key).map(k=>draft[k]),...(key==="reviewer"?[email,creator||""]:[])]}/>)}
      {sod&&<small role="alert">{t("Üç rol farklı kişilere atanmalıdır. Planı hazırlayan kişi inceleyen olamaz.","Assign three different people. A plan author cannot review the plan.")}</small>}
      {field("reviewDate",t("İnceleme tarihi","Review date"),"date")}
      <label>{t("Tatbikat Sıklığı","Exercise frequency")}<select name="exerciseFrequency" value={draft.exerciseFrequency} onChange={e=>patch({exerciseFrequency:e.target.value})}><option value="">{t("Seçin","Select")}</option>{Object.entries(frequencies).map(([k,l])=><option value={k} key={k}>{l[tr?0:1]}</option>)}</select></label>
      <ExerciseDate tr={tr} value={draft.nextExerciseDate} onChange={nextExerciseDate=>patch({nextExerciseDate})}/>
    </div></fieldset>
    <fieldset><legend>{t("2. Kurtarma hedefleri","2. Recovery targets")}</legend><div className="form-grid">
      {(["rpoHours","rtoHours","mtpdHours"] as const).map(k=>field(k,k.replace("Hours","").toUpperCase()+t(" (saat)"," (hours)"),"number"))}{field("minimumStaff",t("Minimum personel","Minimum staff"),"number")}
    </div></fieldset>
    <fieldset><legend>{t("3. Kurtarma ve iletişim","3. Recovery and communication")}</legend><div className="form-grid">
      {dependencies("assetRefs","Varlık Envanteri",t("Bağımlılıklar (AST)","Asset dependencies (AST)"))}
      {dependencies("supplierRefs","Tedarikçiler",t("Tedarikçi bağımlılıkları (VEN)","Supplier dependencies (VEN)"))}
      {field("dependencies",t("Bağımlılık notu (isteğe bağlı)","Dependency note (optional)"),"textarea",false)}
      {field("supplierDependencies",t("Tedarikçi bağımlılık notu (isteğe bağlı)","Supplier dependency note (optional)"),"textarea",false)}
      {field("recoveryStrategy",t("Kurtarma stratejisi","Recovery strategy"),"textarea",true,20)}
      {field("communicationPlan",t("İletişim planı","Communication plan"),"textarea",true,15)}
      {field("alternateSite",t("Alternatif lokasyon (isteğe bağlı)","Alternate site (optional)"),"textarea",false)}
    </div></fieldset>
    {notice&&<p role="alert">{notice}</p>}<footer><button type="button" onClick={close}>{t("Vazgeç","Cancel")}</button>
      <button disabled={busy||sod||rpoBad||rtoBad}>{draft.planId?t("Değişiklikleri kaydet","Save changes"):t("Taslak plan oluştur","Create draft plan")}</button></footer>
  </form>;
}
