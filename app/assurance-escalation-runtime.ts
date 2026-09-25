import {exceptionExpirySeverity,riskReviewSeverity} from "./assurance-escalations";
import {riskReviewEscalation} from "./assurance-governance";
import {notificationGovernanceKinds,buildNotificationGovernanceSignals} from "./assurance-notification-governance";
import {readAssuranceEscalationRows,syncAssuranceEscalationSignals,type AssuranceEscalationSignal} from "./assurance-escalation-store";

const baseKinds=["risk-review","exception-expiry","mandatory-retest","retest-failure"] as const;
export const managedAssuranceEscalationKinds=[...baseKinds,...notificationGovernanceKinds];
const parse=(value:string)=>{try{return JSON.parse(value||"{}") as Record<string,unknown>}catch{return {}}};

export async function readAssuranceReminderConfig(db:D1Database){let reminderDays=15,remindersEnabled=true;try{const row=await db.prepare("SELECT config_json FROM platform_settings WHERE id='default'").first<{config_json:string}>();if(row){const value=parse(row.config_json),days=Number(value.reminderDays);if(Number.isInteger(days)&&days>=1&&days<=365)reminderDays=days;if(value.remindersEnabled===false)remindersEnabled=false}}catch{}return{reminderDays,remindersEnabled}}

export async function reconcileAssuranceEscalations(db:D1Database,now=new Date()){
 const stamp=now.toISOString(),today=stamp.slice(0,10),settings=await readAssuranceReminderConfig(db),signals:AssuranceEscalationSignal[]=[];
 try{
  const rows=await db.prepare("SELECT id,data_json,updated_at FROM simple_grc_records WHERE module='Risk Assessment' ORDER BY updated_at DESC LIMIT 2000").all<{id:string;data_json:string;updated_at:string}>();
  for(const row of rows.results){const data=parse(row.data_json);if(data.residualRiskReviewRequired!==true)continue;const requestedAt=String(data.riskReviewRequestedAt||data.lastReassessedAt||row.updated_at||""),aging=riskReviewEscalation(true,requestedAt,now),severity=riskReviewSeverity(aging.state);if(!severity||(!settings.remindersEnabled&&aging.state==="due-soon"))continue;signals.push({fingerprint:`risk-review:${row.id}`,kind:"risk-review",severity,subjectRef:row.id,owner:String(data.owner||""),title:`Residual risk review ${aging.state}`,detail:`${String(data.title||row.id)} · ${aging.ageDays} day(s) waiting for risk-owner reassessment.`,source:{riskId:row.id,urgency:aging.state,ageDays:aging.ageDays,requestedAt}})}
 }catch{}
 try{
  const rows=await db.prepare("SELECT id,finding_id,rule_id,control_ref,risk_ref,expires_at,status FROM continuous_assurance_exceptions WHERE status='active' ORDER BY expires_at LIMIT 1000").all<{id:string;finding_id:string;rule_id:string;control_ref:string;risk_ref:string;expires_at:string;status:string}>();
  if(settings.remindersEnabled)for(const row of rows.results){const severity=exceptionExpirySeverity(row.expires_at,today,settings.reminderDays);if(!severity)continue;signals.push({fingerprint:`exception-expiry:${row.id}`,kind:"exception-expiry",severity,subjectRef:row.id,owner:"",title:"Assurance exception approaching expiry",detail:`${row.control_ref||row.rule_id||row.risk_ref||row.finding_id||row.id} expires ${row.expires_at}.`,source:{exceptionId:row.id,expiresAt:row.expires_at,controlRef:row.control_ref,riskRef:row.risk_ref,ruleId:row.rule_id,findingId:row.finding_id}})}
 }catch{}
 try{
  const rows=await db.prepare("SELECT id,finding_id,rule_id,status,decision_json,updated_at,result_ref FROM continuous_assurance_work_items WHERE (action='control-retest' AND status IN ('pending-review','approved-awaiting-retest','failed-retest','retest-error')) ORDER BY updated_at DESC LIMIT 1000").all<{id:string;finding_id:string;rule_id:string;status:string;decision_json:string;updated_at:string;result_ref:string|null}>();
  for(const row of rows.results){const decision=parse(row.decision_json),fromException=decision.source==="assurance-exception",failed=row.status==="failed-retest"||row.status==="retest-error";if(!fromException&&!failed)continue;const severity=failed?"critical":"high",kind=failed?"retest-failure":"mandatory-retest",subjectRef=String(decision.exceptionId||row.finding_id||row.id),title=failed?"Continuous Assurance re-test failed":"Mandatory control re-test pending",detail=failed?`${row.finding_id} · ${row.rule_id} · ${row.status}`:`Exception ${String(decision.exceptionId||"")} requires control re-test · ${row.status}.`;signals.push({fingerprint:`${kind}:${fromException?String(decision.exceptionId||row.id):row.id}`,kind,severity,subjectRef,owner:"",title,detail,source:{workItemId:row.id,findingId:row.finding_id,ruleId:row.rule_id,status:row.status,resultRef:row.result_ref||"",exceptionId:String(decision.exceptionId||"")}})}
 }catch{}
 try{signals.push(...await buildNotificationGovernanceSignals(db,now))}catch{}
 const sync=await syncAssuranceEscalationSignals(db,signals,managedAssuranceEscalationKinds,now);return{signals:signals.length,...settings,...sync};
}

export {readAssuranceEscalationRows};
