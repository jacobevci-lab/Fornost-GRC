import type {Actor} from "../api/auth/security";
import {commitLifecycle,lifecycleClaim,lifecycleInsert,nextLifecycleStamp} from "../enterprise-lifecycle-write";
import {reserveRecordCodes} from "../record-code-store";
import {TPRM_CONTROLS,validateAssessment,validateFinding} from "./domain";
import {vendorCode} from "./inventory";
import {answers,parseSurvey,questions,SupplierFlowError,type SurveyRecord} from "./survey";
type Row=Record<string,string|number|null>;
export const surveySql=`(SELECT e.detail FROM third_party_events e WHERE e.vendor_id=a.vendor_id AND e.assessment_id=a.id AND e.action='survey-imported' ORDER BY e.rowid DESC LIMIT 1)`;
export const gapsSql=`(SELECT json_group_object(json_extract(e.detail,'$.control'),e.finding_id) FROM third_party_events e WHERE e.vendor_id=a.vendor_id AND e.assessment_id=a.id AND e.action='survey-finding')`;
export async function changeSurvey(db:D1Database,actor:Actor,input:Record<string,unknown>,action:string){
 const id=input.assessmentId;if(typeof id!=="string"||id.length>100)throw new SupplierFlowError("SURVEY_TARGET");
 const a=await db.prepare("SELECT * FROM third_party_assessments WHERE id=?").bind(id).first<Row>();
 if(!a||a.status!=="draft"||a.updated_at!==input.expectedRevision)throw new SupplierFlowError("SURVEY_CHANGED",409);
 const p=await db.prepare("SELECT * FROM third_party_profiles WHERE vendor_id=?").bind(a.vendor_id).first<Row>();
 if(!p||!["onboarding","reassessment"].includes(String(p.status)))throw new SupplierFlowError("SURVEY_CHANGED",409);
 const email=actor.email.toLowerCase();
 if(actor.role==="Viewer"||email===String(p.reviewer).toLowerCase()||(actor.role!=="Admin"&&email!==String(p.risk_owner).toLowerCase()))throw new SupplierFlowError("SURVEY_ROLE",403);
 const entry=await db.prepare("SELECT code FROM simple_grc_record_codes WHERE record_id=? AND module='Tedarikçiler'").bind(a.vendor_id).first<{code:string}>();
 const code=vendorCode(entry?.code,a.vendor_id),now=nextLifecycleStamp(a.updated_at);
 const guard={sql:`EXISTS (SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND updated_at=? AND status=? AND risk_owner=? AND reviewer=?) AND
 EXISTS (SELECT 1 FROM simple_grc_records WHERE id=? AND module='Tedarikçiler') AND (SELECT code FROM simple_grc_record_codes WHERE record_id=?) IS ?`,
 values:[p.vendor_id,p.updated_at,p.status,p.risk_owner,p.reviewer,p.vendor_id,p.vendor_id,entry?.code??null]};
 const event=(kind:string,detail:unknown,finding:string|null=null)=>lifecycleInsert(db,"third_party_events",{id:crypto.randomUUID(),vendor_id:a.vendor_id,assessment_id:id,finding_id:finding,action:kind,detail:JSON.stringify(detail),actor:actor.email,created_at:now});
 const touch=()=>lifecycleClaim(db,"third_party_assessments","updated_by=?,updated_at=?",[actor.email,now],a,guard);
 if(action==="survey-code"){
   if(code!=="—")return {ok:true,code};
   const [next]=await reserveRecordCodes(db,"Tedarikçiler",1,now);
   await commitLifecycle(db,touch(),[db.prepare(`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
    SELECT ?,'Tedarikçiler',?,? WHERE changes()=1 ON CONFLICT(record_id) DO UPDATE SET code=excluded.code`).bind(a.vendor_id,next,now),event("survey-code-assigned",{code:next})]);
   return {ok:true,code:next};
 }
 if(action==="survey-import"){
   const rows=parseSurvey(input.csv,code,Number(a.cycle_number));
   const controls=Object.fromEntries(rows.map(r=>[r.control,r.answer==="yes"]));
   const score=validateAssessment({...controls,vendorId:a.vendor_id,impact:a.impact,likelihood:a.likelihood,controlMaturity:a.control_maturity,treatmentPlan:a.treatment_plan});
   const survey:SurveyRecord={code,cycle:Number(a.cycle_number),by:actor.email,at:now,rows};
   await commitLifecycle(db,lifecycleClaim(db,"third_party_assessments","questionnaire_json=?,coverage=?,inherent_score=?,residual_score=?,risk_tier=?,critical_gaps_json=?,updated_by=?,updated_at=?",
    [JSON.stringify(score.questionnaire),score.coverage,score.inherentScore,score.residualScore,score.riskTier,JSON.stringify(score.criticalGaps),actor.email,now],a,guard),[event("survey-imported",survey)]);
   return {ok:true};
 }
 const current=await db.prepare(`SELECT ${surveySql} survey,${gapsSql} gaps FROM third_party_assessments a WHERE id=?`).bind(id).first<{survey:string|null;gaps:string}>();
 const survey:SurveyRecord|null=current?.survey?JSON.parse(current.survey):null;
 const item=survey?.rows.find(r=>r.control===input.control);
 if(!item||!TPRM_CONTROLS.includes(item.control)||!["no","partial"].includes(item.answer))throw new SupplierFlowError("SURVEY_GAP");
 if(JSON.parse(current!.gaps)[item.control])throw new SupplierFlowError("SURVEY_DUPLICATE",409);
 const label=questions[item.control][input.lang==="en"?1:0],prefix=input.lang==="en"?"Supplier response":"Tedarikçi yanıtı";
 const finding=validateFinding({assessmentId:id,title:label,description:prefix+" · "+answers[item.answer][input.lang==="en"?1:0]+"\n"+(item.comment||label),severity:input.severity,owner:p.risk_owner,dueDate:input.dueDate});
 const findingId="TPF-"+crypto.randomUUID();
 await commitLifecycle(db,touch(),[lifecycleInsert(db,"third_party_findings",{id:findingId,assessment_id:id,vendor_id:a.vendor_id,title:finding.title,severity:finding.severity,description:finding.description,owner:finding.owner,due_date:finding.dueDate,status:"open",created_by:actor.email,created_at:now,updated_by:actor.email,updated_at:now}),
   event("finding-create",{source:"survey",control:item.control},findingId),event("survey-finding",{control:item.control,answer:item.answer,comment:item.comment,importedAt:survey!.at},findingId)]);
 return {ok:true,findingId};
}
