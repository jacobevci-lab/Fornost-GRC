"use client";
import {useRef,useState} from "react";
import {WorkflowEvidencePicker} from "./workflow-selection-fields";
import {canPrepareExit,exitIdentity,type ExitRecord} from "./third-party-risk/exit";
import {answers,questions,surveyTemplate,parseSurvey,SupplierFlowError,type SurveyRecord} from "./third-party-risk/survey";
import {vendorCode} from "./third-party-risk/inventory";
import {vendorLabel} from "./third-party-risk/labels";

const copy:Record<string,[string,string]>={
 EXIT_GATE:["Kapatmak için erişimleri, veri iadesini/imhasını ve kanıt sürümünü doğrulayın.","Verify access revocation, data return/destruction and the evidence version before closure."],
 EXIT_ROLE:["Bu adım atanmış sahip veya ayrı bir Admin incelemeci gerektirir.","This step requires the assigned owner or an independent Admin reviewer."],
 EXIT_CAPA:["Tedarikçiye bağlı tüm açık bulgu ve CAPA kayıtlarını kapatın.","Close all outstanding supplier findings and corrective actions."],
 EXIT_STATE:["Çıkış durumu değişti. Güncel kaydı kontrol edin.","The exit state changed. Review the current record."],
 EXIT_INPUT:["Erişim ve veri iade durumlarını kontrol edin.","Check access revocation and data disposition."],
 SURVEY_ROLE:["Yanıtları risk sahibi veya bağımsız incelemeci dışındaki yetkili Admin işleyebilir.","Responses can be processed by the risk owner or an Admin other than the reviewer."],
 SURVEY_TARGET:["CSV içindeki tedarikçi kodu ve döngü seçili taslakla eşleşmeli.","The supplier code and cycle in the CSV must match the selected draft."],
 SURVEY_FORMAT:["Güncel CSV şablonunu kullanın. Her kontrol tam bir kez yer almalı, açıklama 1.500 karakteri aşmamalı.","Use the current CSV template. Include each control exactly once and limit each explanation to 1,500 characters."],
 SURVEY_ANSWER:["Her soruya Evet, Kısmi, Hayır veya Uygulanabilir Değil yanıtı girin.","Answer every question with Yes, Partial, No or Not applicable."],
 SURVEY_CHANGED:["Taslak değişti. Güncel döngüyü kontrol edin.","The draft changed. Review the current cycle."],
 SURVEY_DUPLICATE:["Bu yanıt için bir bulgu zaten açılmış.","A finding already exists for this response."],
 SURVEY_GAP:["Yalnız Hayır veya Kısmi yanıtları için bulgu açılabilir.","Findings can be opened for No or Partial responses."],
};
export const supplierMessage=(key:string,tr:boolean)=>copy[key]?.[tr?0:1];
type V={vendorId:string;name:string;status:string;updatedAt:string;code?:string;nextReview?:string;businessOwner?:string;riskOwner?:string;reviewer?:string;reviewerAdmin?:boolean;createdBy?:string;exit?:ExitRecord|null;openFindings?:number};
type A={id:string;vendorId:string;status:string;cycleNumber:number;updatedAt:string;survey?:SurveyRecord|null;surveyFindings?:Record<string,string>};
type Actor={email:string;role:string};
type Write=(body:Record<string,unknown>)=>Promise<boolean>;

export function ExitPanel({vendor:v,actor,tr,busy,write,notice}:{vendor:V;actor:Actor;tr:boolean;busy:boolean;write:Write;notice:string}){
 const x=v.exit,closed=v.status==="offboarded",started=v.status==="offboarding",prepare=canPrepareExit(actor,v);
 const [access,setAccess]=useState(Boolean(x?.accessRevoked)),[returned,setReturned]=useState(Boolean(x?.dataReturned));
 const [choice,setChoice]=useState({evidenceId:"",versionId:""}),[confirm,setConfirm]=useState("");
 const canApprove=actor.role==="Admin"&&v.reviewerAdmin&&exitIdentity(actor.email)===exitIdentity(v.reviewer)&&![v.businessOwner,v.riskOwner,v.createdBy,x?.preparedBy].some(p=>exitIdentity(p)===exitIdentity(actor.email));
 const saved=Boolean(x?.accessRevoked&&x?.dataReturned&&x.proof&&x.preparedBy);
 const payload={vendorId:v.vendorId,expectedRevision:v.updatedAt};
 if(!started&&!closed)return prepare&&!["excluded","unmanaged","cancelled","rejected"].includes(v.status)?<button type="button" disabled={busy} onClick={()=>void write({...payload,action:"start-exit"})}>{tr?"Çıkış sürecini başlat":"Start offboarding"}</button>:null;
 const count=closed?x?.openFindings:v.openFindings;
 return <section className="tprm-phase-panel"><h4>{tr?"Tedarikçi Çıkış (Offboarding) Kontrol Listesi":"Supplier offboarding checklist"}</h4>
 {closed&&!x?<p>{tr?"Bu geçmiş kapanışın kontrol listesi kaydı bulunmuyor.":"No checklist was recorded for this historical exit."}</p>:<>
 <label><input type="checkbox" disabled={!started||!prepare||busy} checked={access} onChange={e=>setAccess(e.target.checked)}/>{tr?"Tüm API, SSO, VPN ve kullanıcı erişimleri iptal edildi":"All API, SSO, VPN and user access revoked"}</label>
 <label><input type="checkbox" disabled={!started||!prepare||busy} checked={returned} onChange={e=>setReturned(e.target.checked)}/>{tr?"Kurum verileri iade edildi veya güvenli şekilde imha edildi":"Organizational data returned or securely destroyed"}</label>
 <p>{x?.proof?"✓":"○"} {tr?"Veri İmha / İade Tutanağı":"Destruction / return certificate"} · {x?.proof?[x.proof.code,x.proof.title,"v"+x.proof.versionNo].filter(Boolean).join(" · "):"—"}</p>
 {started&&prepare&&<><WorkflowEvidencePicker document tr={tr} value={choice} onChange={setChoice}/><button type="button" disabled={busy||Boolean(choice.evidenceId&&!choice.versionId)||(access===Boolean(x?.accessRevoked)&&returned===Boolean(x?.dataReturned)&&!choice.versionId)} onClick={()=>void write({...payload,action:"save-exit",accessRevoked:access,dataReturned:returned,...(choice.versionId?{evidenceMode:"library",evidenceSelection:choice}:{})})}>{tr?"Kontrol listesini kaydet":"Save checklist"}</button></>}
 <p>{count===0?"✓":"○"} {tr?"Açık bulgu / CAPA":"Open findings / CAPA"} · {count??"—"}</p>
 <p>{x?.approvedBy?"✓":"○"} {tr?"Bağımsız Admin kapanış onayı":"Independent Admin closure approval"} · {x?.approvedBy||v.reviewer||"—"}{x?.approvedAt&&" · "+new Date(x.approvedAt).toLocaleString(tr?"tr-TR":"en-GB")}</p>
 {started&&canApprove&&<><label>{tr?"Onay için TEDARİKÇİYİ KAPAT yazın":"Type TEDARİKÇİYİ KAPAT to confirm"}<input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button type="button" disabled={busy||!saved||count!==0||confirm!=="TEDARİKÇİYİ KAPAT"} onClick={()=>void write({...payload,action:"offboard",confirmation:confirm})}>{tr?"Çıkışı onayla ve sonlandır":"Approve and complete offboarding"}</button></>}
 </>}{notice&&<p role="status">{notice}</p>}</section>;
}

function download(code:string,cycle:number,tr:boolean){
 const url=URL.createObjectURL(new Blob([surveyTemplate(code,cycle,tr)],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");
 link.href=url;link.download=code+"-"+cycle+"-questionnaire.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function SurveyTools({vendors,assessments,actor,tr,busy,write}:{vendors:V[];assessments:A[];actor:Actor;tr:boolean;busy:boolean;write:Write}){
 const [selected,setSelected]=useState("");
 const profiles=new Map(vendors.map(v=>[v.vendorId,v])),drafts=assessments.filter(a=>a.status==="draft"&&["onboarding","reassessment"].includes(profiles.get(a.vendorId)?.status||""));
 const a=drafts.find(a=>a.id===selected)||drafts[0],v=a&&profiles.get(a.vendorId);
 return <section className="tprm-phase-panel"><h3>{tr?"Dış tedarikçi anketi":"External supplier questionnaire"}</h3>{a&&v?<><label>{tr?"Tedarikçi / taslak döngü":"Supplier / draft cycle"}<select value={a.id} onChange={e=>setSelected(e.target.value)}>{drafts.map(d=><option key={d.id} value={d.id}>{profiles.get(d.vendorId)?.name} · {profiles.get(d.vendorId)?.code||"—"} · #{d.cycleNumber}</option>)}</select></label>
 <SurveyDraft key={a.id} a={a} v={v} actor={actor} tr={tr} busy={busy} write={write}/></>:<p>{tr?"Anket için açık taslak değerlendirme bulunmuyor.":"No draft assessment is available for a questionnaire."}</p>}</section>;
}
function SurveyDraft({a,v,actor,tr,busy,write}:{a:A;v:V;actor:Actor;tr:boolean;busy:boolean;write:Write}){
 const file=useRef<HTMLInputElement>(null),[error,setError]=useState(""),[reading,setReading]=useState(false);
 const [severity,setSeverity]=useState("medium"),today=new Date().toISOString().slice(0,10),[due,setDue]=useState(v.nextReview&&v.nextReview>=today?v.nextReview:today);
 const code=vendorCode(v.code,v.vendorId),writer=actor.role!=="Viewer"&&exitIdentity(actor.email)!==exitIdentity(v.reviewer)&&(actor.role==="Admin"||exitIdentity(actor.email)===exitIdentity(v.riskOwner));
 const action={assessmentId:a.id,expectedRevision:a.updatedAt};
 async function upload(f?:File){if(!f)return;setReading(true);setError("");
   try{if(f.size>64000)throw new SupplierFlowError("SURVEY_FORMAT");const csv=await f.text();parseSurvey(csv,code,a.cycleNumber);await write({...action,action:"survey-import",csv})}
   catch(e){setError(supplierMessage(e instanceof SupplierFlowError?e.code:"SURVEY_FORMAT",tr))}finally{setReading(false)}
 }
 return <><div className="tprm-row-actions"><button type="button" disabled={code==="—"||busy} onClick={()=>download(code,a.cycleNumber,tr)}>{tr?"Anket Şablonu İndir (CSV)":"Download questionnaire template (CSV)"}</button>
 <button type="button" disabled={!writer||code==="—"||busy||reading} onClick={()=>file.current?.click()}>{tr?"Yanıtları İçe Aktar (CSV)":"Import responses (CSV)"}</button>
 <input ref={file} type="file" hidden accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];e.target.value="";void upload(f)}}/>
 {code==="—"&&writer&&<button disabled={busy} onClick={()=>void write({...action,action:"survey-code"})}>{tr?"Anket için VEN kodu ata":"Assign VEN code for questionnaire"}</button>}</div>
 <small>{tr?"İçe aktarma taslağın 12 kontrol yanıtını günceller. Yalnız Evet yanıtları işaretlenir.":"Import updates all 12 draft control responses. Only Yes checks a control."}</small>
 {error&&<p role="alert">{error}</p>}
 {a.survey&&<><SurveyAnswers a={a} tr={tr} action={writer?(control)=><button disabled={busy||!due||due<today} onClick={()=>void write({...action,action:"survey-finding",control,severity,dueDate:due,lang:tr?"tr":"en"})}>{tr?"+ Bulgu Oluştur":"+ Create finding"}</button>:undefined}/>
 {writer&&a.survey.rows.some(r=>["no","partial"].includes(r.answer)&&!a.surveyFindings?.[r.control])&&<div className="tprm-gap-options"><span>{tr?"Bulgu sahibi":"Finding owner"} · {v.riskOwner}</span><label>{tr?"Önem":"Severity"}<select value={severity} onChange={e=>setSeverity(e.target.value)}>{["low","medium","high","critical"].map(s=><option key={s} value={s}>{vendorLabel(s,tr)}</option>)}</select></label><label>{tr?"Bulgu termini":"Finding due date"}<input type="date" min={today} value={due} onChange={e=>setDue(e.target.value)}/></label></div>}</>}</>;
}
export function SurveyAnswers({a,tr,action}:{a:A;tr:boolean;action?:(control:string)=>React.ReactNode}){
 if(!a.survey)return null;
 return <details className="tprm-survey-answers" open={action?true:undefined}><summary>{tr?"İçe aktarılan anket yanıtları":"Imported questionnaire responses"} · #{a.cycleNumber}</summary><ul>{a.survey.rows.map(r=><li key={r.control}><b>{questions[r.control][tr?0:1]}</b><span>{answers[r.answer][tr?0:1]}</span>{r.comment&&<p>{r.comment}</p>}
 {a.surveyFindings?.[r.control]?<small>{tr?"Bulgu oluşturuldu":"Finding created"}</small>:["no","partial"].includes(r.answer)&&action?.(r.control)}</li>)}</ul></details>;
}
