import { assuranceEscalationNavigation } from "../assurance-escalation-navigation";
import { buildContinuousAssuranceDashboard, type AssurancePriority } from "../continuous-assurance-dashboard";
import { loadContinuousAssuranceSnapshots } from "../continuous-assurance-store";
import { dataClassificationAllowed, type AiDataClassification } from "./data-policy";

export type OperationalAssuranceNavigation = {module:string;ref:string;filterKey:"riskRef"|"controlRef"|"ruleRef"|"findingRef"};
export type OperationalAssuranceContextSource = { id: string; module: string; title: string; navigation?: OperationalAssuranceNavigation };

type RiskReviewRow = { id:string;risk_id:string;status:string;submitted_at:string };
type ExceptionRow = { id:string;finding_id:string;rule_id:string;control_ref:string;risk_ref:string;reason:string;expires_at:string;status:string;retest_required:number|null };
type EscalationRow = { id:string;kind:string;severity:string;subject_ref:string;owner:string;title:string;detail:string;status:string;first_seen_at:string;last_seen_at:string;source_json:string };

export type OperationalAssuranceGovernanceSummary = {
  pendingRiskReviews:number;
  pendingExceptions:number;
  activeExceptions:number;
  expiringExceptions:number;
  mandatoryRetests:number;
  openEscalations:number;
  criticalEscalations:number;
  highEscalations:number;
};

const emptyGovernance:OperationalAssuranceGovernanceSummary={pendingRiskReviews:0,pendingExceptions:0,activeExceptions:0,expiringExceptions:0,mandatoryRetests:0,openEscalations:0,criticalEscalations:0,highEscalations:0};
const compact = (value: unknown, max = 180) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const safeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 120);
const parseObject=(value:string)=>{try{const parsed=JSON.parse(value||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return {}}};

async function safeRows<T>(db:D1Database,sql:string){try{return (await db.prepare(sql).all<T>()).results||[]}catch{return [] as T[]}}
async function exceptionRows(db:D1Database){
  try{return (await db.prepare("SELECT id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,status,retest_required FROM continuous_assurance_exceptions WHERE status IN ('pending-review','active') OR retest_required=1 ORDER BY CASE status WHEN 'pending-review' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,expires_at ASC LIMIT 20").all<ExceptionRow>()).results||[]}
  catch{
    const legacy=await safeRows<Omit<ExceptionRow,"retest_required">>(db,"SELECT id,finding_id,rule_id,control_ref,risk_ref,reason,expires_at,status FROM continuous_assurance_exceptions WHERE status IN ('pending-review','active') ORDER BY CASE status WHEN 'pending-review' THEN 0 ELSE 1 END,expires_at ASC LIMIT 20");
    return legacy.map(row=>({...row,retest_required:0}));
  }
}
function exceptionNavigation(row:ExceptionRow):OperationalAssuranceNavigation|undefined{
  const controlRef=compact(row.control_ref,120),riskRef=compact(row.risk_ref,120),ruleRef=compact(row.rule_id,120),findingRef=compact(row.finding_id,120);
  if(controlRef)return{module:"Kontroller",ref:controlRef,filterKey:"controlRef"};
  if(riskRef)return{module:"Risk Assessment",ref:riskRef,filterKey:"riskRef"};
  if(ruleRef)return{module:"Kanıt Otomasyonu",ref:ruleRef,filterKey:"ruleRef"};
  if(findingRef)return{module:"Kanıt Otomasyonu",ref:findingRef,filterKey:"findingRef"};
  return undefined;
}
function priorityNavigation(item:AssurancePriority):OperationalAssuranceNavigation|undefined{
  const ruleRef=compact(item.ruleId,120),findingRef=compact(item.findingId,120),controlRef=compact(item.targetControlRef,120);
  if(item.kind==="control"&&ruleRef)return{module:"Kanıt Otomasyonu",ref:ruleRef,filterKey:"ruleRef"};
  if(item.kind==="finding"&&findingRef)return{module:"Kanıt Otomasyonu",ref:findingRef,filterKey:"findingRef"};
  if(item.kind==="work-item"&&ruleRef)return{module:"Kanıt Otomasyonu",ref:ruleRef,filterKey:"ruleRef"};
  if(controlRef)return{module:"Kontroller",ref:controlRef,filterKey:"controlRef"};
  return undefined;
}

export async function buildOperationalAssuranceAiContext(
  db: D1Database,
  maxDataClassification: AiDataClassification,
  maxChars = 6_500,
) {
  if (!dataClassificationAllowed("Internal", maxDataClassification)) {
    return { sources: [] as OperationalAssuranceContextSource[], contextText: "", summaryAvailable: false, governance:emptyGovernance };
  }

  const [snapshots,riskReviews,exceptions,escalations]=await Promise.all([
    loadContinuousAssuranceSnapshots(db),
    safeRows<RiskReviewRow>(db,"SELECT id,risk_id,status,submitted_at FROM continuous_assurance_risk_reviews WHERE status='pending-review' ORDER BY submitted_at ASC LIMIT 12"),
    exceptionRows(db),
    safeRows<EscalationRow>(db,"SELECT id,kind,severity,subject_ref,owner,title,detail,status,first_seen_at,last_seen_at,source_json FROM continuous_assurance_escalations WHERE status IN ('active','acknowledged') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,last_seen_at DESC LIMIT 20"),
  ]);
  const now=new Date(),today=now.toISOString().slice(0,10),in14=new Date(now.getTime()+14*86_400_000).toISOString().slice(0,10);
  const governance:OperationalAssuranceGovernanceSummary={
    pendingRiskReviews:riskReviews.length,
    pendingExceptions:exceptions.filter(row=>row.status==="pending-review").length,
    activeExceptions:exceptions.filter(row=>row.status==="active").length,
    expiringExceptions:exceptions.filter(row=>row.status==="active"&&row.expires_at>=today&&row.expires_at<=in14).length,
    mandatoryRetests:exceptions.filter(row=>Boolean(row.retest_required)).length,
    openEscalations:escalations.length,
    criticalEscalations:escalations.filter(row=>row.severity==="critical").length,
    highEscalations:escalations.filter(row=>row.severity==="high").length,
  };
  const snapshotAvailable=Boolean(snapshots.rules.length||snapshots.findings.length||snapshots.workItems.length);
  const governanceAvailable=Object.values(governance).some(value=>value>0);
  if(!snapshotAvailable&&!governanceAvailable)return{sources:[] as OperationalAssuranceContextSource[],contextText:"",summaryAvailable:false,governance};

  const dashboard = buildContinuousAssuranceDashboard({rules:snapshots.rules,findings:snapshots.findings,workItems:snapshots.workItems,now});
  const sources: OperationalAssuranceContextSource[] = [];
  const chunks: string[] = [];
  let used = 0;

  const add = (source: OperationalAssuranceContextSource, payload: Record<string, unknown>) => {
    const chunk = JSON.stringify({sourceId:source.id,module:source.module,title:source.title,dataClassification:"Internal",data:payload});
    if (used + chunk.length > maxChars) return false;
    used += chunk.length;
    sources.push(source);
    chunks.push(chunk);
    return true;
  };

  add({id:"CA-GOVERNANCE-SUMMARY",module:"Bağlantılı GRC",title:"Continuous Assurance governance queue"},{generatedAt:now.toISOString(),...governance});
  for(const review of riskReviews.slice(0,5)){
    const riskRef=compact(review.risk_id,120),navigation=riskRef?{module:"Risk Assessment",ref:riskRef,filterKey:"riskRef" as const}:undefined;
    if(!add({id:`CA-RISK-REVIEW-${safeIdPart(review.id)}`,module:"Risk Assessment",title:`Pending residual risk review · ${riskRef||compact(review.id)}`,...(navigation?{navigation}:{})},{reviewId:compact(review.id),riskRef,status:compact(review.status),submittedAt:compact(review.submitted_at)}))break;
  }
  for(const exception of exceptions.slice(0,7)){
    const subject=compact(exception.control_ref||exception.risk_ref||exception.rule_id||exception.finding_id||exception.id),navigation=exceptionNavigation(exception);
    if(!add({id:`CA-EXCEPTION-${safeIdPart(exception.id)}`,module:navigation?.module||"Bağlantılı GRC",title:`Assurance exception · ${subject}`,...(navigation?{navigation}:{})},{exceptionId:compact(exception.id),status:compact(exception.status),controlRef:compact(exception.control_ref),riskRef:compact(exception.risk_ref),ruleId:compact(exception.rule_id),findingId:compact(exception.finding_id),expiresAt:compact(exception.expires_at),retestRequired:Boolean(exception.retest_required),reason:compact(exception.reason)}))break;
  }
  for(const escalation of escalations.slice(0,7)){
    const resolved=assuranceEscalationNavigation(escalation.kind,parseObject(escalation.source_json));
    const navigation=resolved?{module:resolved.module,ref:resolved.recordRef,filterKey:resolved.filterKey}:undefined;
    if(!add({id:`CA-ESCALATION-${safeIdPart(escalation.id)}`,module:navigation?.module||"Bağlantılı GRC",title:`Assurance escalation · ${compact(escalation.title)||compact(escalation.kind)}`,...(navigation?{navigation}:{})},{escalationId:compact(escalation.id),kind:compact(escalation.kind),severity:compact(escalation.severity),status:compact(escalation.status),subjectRef:compact(escalation.subject_ref),owner:compact(escalation.owner),detail:compact(escalation.detail),firstSeenAt:compact(escalation.first_seen_at),lastSeenAt:compact(escalation.last_seen_at)}))break;
  }

  add({id:"CA-SUMMARY",module:"Kanıt Otomasyonu",title:"Continuous Assurance operational summary"},{generatedAt:dashboard.generatedAt,assuranceCoverage:dashboard.summary.assuranceCoverage,totalControls:dashboard.summary.totalControls,healthyControls:dashboard.summary.healthy,failingControls:dashboard.summary.failing,evidenceIntegrityFailures:dashboard.summary.integrityFailures,staleOrMissingEvidence:dashboard.summary.stale,evidenceExpiring:dashboard.summary.expiring,controlsDue:dashboard.summary.due,openFindings:dashboard.summary.openFindings,overdueRemediation:dashboard.summary.overdueRemediation,pendingReview:dashboard.summary.pendingReview,awaitingRetest:dashboard.summary.awaitingRetest,failedRetest:dashboard.summary.failedRetest,dataQuality:snapshots.dataQuality});

  for (const item of dashboard.priorities.slice(0, 18)) {
    const rawId=item.id.replace(/^(rule|finding|work):/,"");
    const sourceId=item.kind==="work-item"?`CA-WORK-${safeIdPart(rawId)}`:item.kind==="finding"?`CA-FINDING-${safeIdPart(rawId)}`:`CA-CONTROL-${safeIdPart(rawId)}`;
    const navigation=priorityNavigation(item);
    const source:OperationalAssuranceContextSource={id:sourceId,module:navigation?.module||"Kanıt Otomasyonu",title:compact(item.title),...(navigation?{navigation}:{})};
    if (!add(source,{kind:item.kind,action:compact(item.action,80),state:compact(item.state,80),priority:item.priority,ruleId:compact(item.ruleId,120),ruleName:compact(item.ruleName),findingId:compact(item.findingId,120),targetControlRef:compact(item.targetControlRef,120),owner:compact(item.owner,160),dueDate:compact(item.dueDate,40),reason:compact(item.reason,100),evidenceIntegrity:compact(item.evidenceIntegrity,40),linkedEvidenceCount:Number(item.linkedEvidenceCount||0),updatedAt:compact(item.updatedAt,60)}))break;
  }

  return {sources,contextText:chunks.join("\n"),summaryAvailable:chunks.length>0,governance};
}
