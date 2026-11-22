import {commitLifecycle,lifecycleInsert} from "../enterprise-lifecycle-write";
import {prepareWorkflowSelection,workflowPinStatement,joinWorkflowGuards} from "../workflow-selection-store";
import type {Actor} from "../api/auth/security";
import {validReviewDate} from "./review-schedule";
import {decisionChecks,documentTypes,utcDay,type AssuranceDocument,type AssuranceVendor} from "./assurance";

export const assuranceSchema = `CREATE TABLE IF NOT EXISTS third_party_assurance_documents(
  vendor_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('iso','soc','dpa','pentest','bcdr')),
  revision TEXT NOT NULL, evidence_id TEXT NOT NULL, version_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  title TEXT NOT NULL, sha256 TEXT NOT NULL, expires TEXT NOT NULL, PRIMARY KEY(vendor_id,kind)
)`;
export class AssuranceError extends Error{
  constructor(public code:"DOCUMENT_INPUT"|"DOCUMENT_CONFLICT"|"DECISION_GATE",public status:number){super(code);}
}
// The same ordered projections are used in the workspace, the decision snapshot and its atomic write guard.
export function documentsSql(vendor:string){return `(SELECT json_group_array(json(doc)) FROM (
 SELECT json_object('kind',d.kind,'revision',d.revision,'evidenceId',d.evidence_id,'versionId',d.version_id,
 'versionNo',d.version_no,'code',c.code,'title',d.title,'sha256',d.sha256,'expires',d.expires,
 'available',CASE WHEN ev.id IS NULL THEN 0 ELSE 1 END) doc
 FROM third_party_assurance_documents d LEFT JOIN simple_grc_records ev ON ev.id=d.evidence_id AND ev.module='Kanıtlar'
 LEFT JOIN simple_grc_record_codes c ON c.record_id=ev.id WHERE d.vendor_id=${vendor} ORDER BY d.kind))`;}
export const supportSql=`(SELECT json_group_array(id) FROM (SELECT DISTINCT ev.id FROM json_each(r.data_json,'$.vendorEvidenceRefs') refs
 JOIN simple_grc_records ev ON ev.module='Kanıtlar' AND (ev.id=refs.value OR ev.id=(SELECT record_id FROM simple_grc_record_codes WHERE code=refs.value)) ORDER BY ev.id))`;
export const submissionSql=`(SELECT json_object('evidenceId',ev.id,'versionId',json_extract(w.snapshot_json,'$.id'),'sha256',json_extract(w.snapshot_json,'$.contentSha256'))
 FROM workflow_evidence_pins w JOIN simple_grc_records ev ON ev.id=json_extract(w.snapshot_json,'$.evidenceId') AND ev.module='Kanıtlar'
 WHERE w.workflow='tprm' AND w.entity_id=a.id AND w.purpose='assessment-submit' ORDER BY w.created_at DESC,w.id DESC LIMIT 1)`;
export const reviewerSql="EXISTS (SELECT 1 FROM local_users u WHERE u.email=p.reviewer COLLATE NOCASE AND u.status='Active' AND u.role='Admin')";
export async function hasDirectory(db:D1Database){return Boolean(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_users'").first());}
type Env={DB:D1Database;BUCKET?:R2Bucket};

export async function saveAssurance(env:Env,actor:Actor,input:Record<string,unknown>){
  const {vendorId,kind,expectedRevision,expires}=input,remove=input.remove===true;
  if(typeof vendorId!=="string"||!vendorId||vendorId.length>120||typeof kind!=="string"||!Object.hasOwn(documentTypes,kind)||
    typeof expectedRevision!=="string"||expectedRevision.length>100||(remove?!expectedRevision:!validReviewDate(expires)))throw new AssuranceError("DOCUMENT_INPUT",400);
  const selection=await prepareWorkflowSelection(env,actor,input,{},!remove);
  if(!remove&&!selection.evidence)throw new AssuranceError("DOCUMENT_INPUT",400);
  const db=env.DB,id=crypto.randomUUID(),now=new Date().toISOString(),e=selection.evidence;
  const guard=joinWorkflowGuards(selection.guard,{sql:`COALESCE((SELECT revision FROM third_party_assurance_documents WHERE vendor_id=? AND kind=?),'')=?
    AND NOT EXISTS(SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND status IN ('offboarded','cancelled','rejected'))`,values:[vendorId,kind,expectedRevision,vendorId]});
  const claim=db.prepare(`UPDATE simple_grc_records SET updated_at=CASE WHEN updated_at>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0.001 seconds') ELSE ? END
    WHERE id=? AND module='Tedarikçiler' AND (${guard.sql})`).bind(now,now,vendorId,...guard.values);
  const change=remove?db.prepare("DELETE FROM third_party_assurance_documents WHERE vendor_id=? AND kind=? AND changes()=1").bind(vendorId,kind):
    db.prepare(`INSERT INTO third_party_assurance_documents(vendor_id,kind,revision,evidence_id,version_id,version_no,title,sha256,expires)
    SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1 ON CONFLICT(vendor_id,kind) DO UPDATE SET revision=excluded.revision,evidence_id=excluded.evidence_id,
    version_id=excluded.version_id,version_no=excluded.version_no,title=excluded.title,sha256=excluded.sha256,expires=excluded.expires`)
    .bind(vendorId,kind,id,e!.evidenceId,e!.id,e!.versionNo,e!.evidenceTitle,e!.contentSha256,expires);
  await commitLifecycle(db,claim,[change,lifecycleInsert(db,"third_party_events",{id,vendor_id:vendorId,action:remove?"document-removed":"document-linked",
    detail:JSON.stringify({kind,previousRevision:expectedRevision,expires:remove?null:expires,versionId:e?.id||null}),actor:actor.email,created_at:now}),
    ...workflowPinStatement(db,selection,"tprm",vendorId,"assurance-"+kind,id,actor.email)]);
  return {ok:true};
}

export async function decisionGate(db:D1Database,a:Record<string,unknown>,input:Record<string,unknown>,canonical?:{evidenceId:string;id:string;contentSha256:string}){
  const reason=input.riskAcceptanceReason??"";
  if(typeof reason!=="string"||reason.length>1200)throw new AssuranceError("DECISION_GATE",422);
  if(!await hasDirectory(db))throw new AssuranceError("DECISION_GATE",409);
  const sql=`SELECT ${documentsSql("p.vendor_id")} docs,${supportSql} support,${reviewerSql} admin,${submissionSql} submission
    FROM third_party_profiles p JOIN simple_grc_records r ON r.id=p.vendor_id AND r.module='Tedarikçiler' JOIN third_party_assessments a ON a.vendor_id=p.vendor_id WHERE p.vendor_id=? AND a.id=?`;
  const row=await db.prepare(sql).bind(a.vendor_id,a.id).first<{docs:string;support:string;admin:number;submission:string|null}>();
  if(!row)throw new AssuranceError("DECISION_GATE",409);
  const documents:AssuranceDocument[]=JSON.parse(row.docs),today=utcDay();
  const v={businessOwner:String(a.business_owner||""),riskOwner:String(a.risk_owner||""),reviewer:String(a.reviewer||""),reviewerAdmin:Boolean(row.admin),documents,supportIds:JSON.parse(row.support)} as AssuranceVendor;
  const score={impact:a.impact,likelihood:a.likelihood,controlMaturity:a.control_maturity,inherentScore:a.inherent_score,residualScore:a.residual_score,questionnaire:JSON.parse(String(a.questionnaire_json))};
  const submission=row.submission?JSON.parse(row.submission):null;
  const checks=decisionChecks(v,score,reason,canonical?.evidenceId||submission?.evidenceId,today);
  if(!Object.values(checks).every(Boolean))throw new AssuranceError("DECISION_GATE",409);
  return {guard:{sql:`EXISTS (SELECT 1 FROM (${sql}) WHERE docs=? AND support=? AND submission IS ? AND admin=1) AND date('now')=?`,values:[a.vendor_id,a.id,row.docs,row.support,row.submission,today]},
    snapshot:{checks,businessOwner:v.businessOwner,riskOwner:v.riskOwner,reviewer:v.reviewer,score,documents,supportIds:v.supportIds,submission,decisionEvidence:canonical?{id:canonical.evidenceId,versionId:canonical.id,sha256:canonical.contentSha256}:null,riskAcceptanceReason:reason.trim(),asOf:today}};
}
