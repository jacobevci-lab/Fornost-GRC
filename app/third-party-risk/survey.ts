import {TPRM_CONTROLS,type TprmControl} from "./domain";
import {readCsvRows} from "../workpaper-sample-import";

export const questions:Record<TprmControl,[string,string]>={
 securityProgram:["Belgelenmiş bir bilgi güvenliği programınız var mı?","Do you maintain a documented information security program?"],
 accessControl:["Ayrıcalıklı erişimler sınırlandırılıyor ve gözden geçiriliyor mu?","Do you restrict and review privileged access?"],
 encryption:["Veriler aktarımda ve depoda şifreleniyor mu?","Is data encrypted in transit and at rest?"],
 logging:["Güvenlik olayları kaydediliyor ve izleniyor mu?","Do you log and monitor security events?"],
 vulnerabilityManagement:["Zafiyetler ve yamalar takip edilip gideriliyor mu?","Do you track and remediate vulnerabilities and missing patches?"],
 incidentNotification:["Olay bildirim süreleri tanımlı mı?","Have you defined incident notification timelines?"],
 bcdr:["İş sürekliliği ve kurtarma planları test ediliyor mu?","Do you test business continuity and recovery plans?"],
 subprocessorGovernance:["Alt işleyenlerin güvenliği değerlendiriliyor mu?","Do you assess subprocessor security?"],
 dataDeletion:["Veri iadesi ve güvenli imha süreciniz var mı?","Do you operate a data return and secure destruction process?"],
 auditRights:["Müşterinin denetim hakkı tanımlı mı?","Are customer audit rights defined?"],
 dataPortability:["Çıkışta veri taşınabilirliği sağlanıyor mu?","Do you support data portability on exit?"],
 dpa:["İmzalı veri işleme sözleşmeniz var mı?","Is a signed data processing agreement in place?"],
};
const headings=[["Tedarikçi Kodu","Döngü","Kontrol","Soru","Uygulama Durumu (Evet / Kısmi / Hayır / Uygulanabilir Değil)","Tedarikçi Açıklaması"],["Vendor code","Cycle","Control","Question","Implementation status (Yes / Partial / No / Not applicable)","Supplier explanation"]];
export const answers={yes:["Evet","Yes"],partial:["Kısmi","Partial"],no:["Hayır","No"],na:["Uygulanabilir Değil","Not applicable"]} as const;
export type Answer=keyof typeof answers;
export type SurveyRow={control:TprmControl;answer:Answer;comment:string};
export type SurveyRecord={rows:SurveyRow[];at:string;by:string;code:string;cycle:number};
export class SupplierFlowError extends Error{constructor(public code:string,public status=422){super(code)}}
export function surveyTemplate(code:string,cycle:number,tr:boolean){
 if(!/^VEN-\d{3,}$/.test(code)||!Number.isSafeInteger(cycle)||cycle<1)throw new SupplierFlowError("SURVEY_TARGET");
 const index=tr?0:1,rows=[headings[index],...TPRM_CONTROLS.map(k=>[code,String(cycle),k,questions[k][index],"",""])];
 return "\uFEFF"+rows.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(",")).join("\r\n")+"\r\n";
}
export function parseSurvey(csv:unknown,code:string,cycle:number):SurveyRow[]{
 if(typeof csv==="string"&&csv.includes("\0"))throw new SupplierFlowError("SURVEY_FORMAT");
 if(typeof csv!=="string"||!/^VEN-\d{3,}$/.test(code))throw new SupplierFlowError("SURVEY_TARGET");
 let lines:string[][];
 try{lines=readCsvRows(csv,6,12,64000)}catch{throw new SupplierFlowError("SURVEY_FORMAT")}
 if(lines.length!==13||!headings.some(h=>h.every((v,i)=>lines[0]?.[i]?.trim()===v)))throw new SupplierFlowError("SURVEY_FORMAT");
 const seen=new Set<string>();
 return lines.slice(1).map(row=>{
  const [vendor,round,key,,answer,comment]=row.map(v=>v.trim());
  if(vendor!==code||round!==String(cycle))throw new SupplierFlowError("SURVEY_TARGET");
  if(row.length!==6||!Object.hasOwn(questions,key)||seen.has(key)||comment.length>1500)throw new SupplierFlowError("SURVEY_FORMAT");
  const value=(Object.keys(answers) as Answer[]).find(a=>answers[a].some(s=>s.toLocaleLowerCase("tr")===answer.toLocaleLowerCase("tr")));
  if(!value)throw new SupplierFlowError("SURVEY_ANSWER");
  seen.add(key);return {control:key as TprmControl,answer:value,comment};
 });
}
