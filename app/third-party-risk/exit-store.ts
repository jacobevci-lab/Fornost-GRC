import type {Actor} from "../api/auth/security";
import {commitLifecycle,lifecycleClaim,lifecycleInsert,nextLifecycleStamp} from "../enterprise-lifecycle-write";
import {prepareWorkflowSelection,joinWorkflowGuards,workflowPinStatement} from "../workflow-selection-store";
import {SupplierFlowError} from "./survey";

type Row=Record<string,string|number|null>;
import {canPrepareExit,exitIdentity as norm,type ExitRecord} from "./exit";
export const exitSql=`(SELECT detail FROM third_party_events e WHERE e.vendor_id=p.vendor_id AND e.action IN ('exit-started','exit-prepared','vendor-offboard') AND CASE WHEN json_valid(detail) THEN json_extract(detail,'$.schema')='supplier-exit-v1' ELSE 0 END ORDER BY e.rowid DESC LIMIT 1)`;
export async function changeExit(env:{DB:D1Database;BUCKET?:R2Bucket},actor:Actor,input:Record<string,unknown>,action:string){
 const db=env.DB,id=input.vendorId;
 if(typeof id!=="string"||id.length>100||typeof input.expectedRevision!=="string")throw new SupplierFlowError("EXIT_STATE",409);
 const p=await db.prepare("SELECT * FROM third_party_profiles WHERE vendor_id=?").bind(id).first<Row>();
 if(!p||(action==="offboard"&&p.status==="offboarded"))throw new SupplierFlowError("EXIT_STATE",404);
 if(p.updated_at!==input.expectedRevision||["offboarded","rejected","cancelled"].includes(String(p.status)))throw new SupplierFlowError("EXIT_STATE",409);
 const started=action==="start-exit",closing=action==="offboard",now=nextLifecycleStamp(p.updated_at);
 if(started===(p.status==="offboarding"))throw new SupplierFlowError("EXIT_STATE",409);
 const people={businessOwner:String(p.business_owner),riskOwner:String(p.risk_owner),reviewer:String(p.reviewer)};
 const permitted=canPrepareExit(actor,people);
 if(closing?(actor.role!=="Admin"||norm(actor.email)!==norm(p.reviewer)||[p.created_by,p.business_owner,p.risk_owner].some(v=>norm(v)===norm(actor.email))):!permitted)throw new SupplierFlowError("EXIT_ROLE",403);
 const latest=await db.prepare(`SELECT ${exitSql} value FROM third_party_profiles p WHERE vendor_id=?`).bind(id).first<{value:string|null}>();
 const previous:ExitRecord|null=latest?.value?JSON.parse(latest.value):null;
 if(!started&&!previous)throw new SupplierFlowError("EXIT_STATE",409);
 let state:ExitRecord=previous||{schema:"supplier-exit-v1",startedAt:now,accessRevoked:false,dataReturned:false,preparedBy:null,proof:null,approvedBy:null,approvedAt:null,openFindings:null};
 if(closing&&(!state.accessRevoked||!state.dataReturned||!state.proof||!state.preparedBy||norm(state.preparedBy)===norm(actor.email)||input.confirmation!=="TEDARİKÇİYİ KAPAT"))throw new SupplierFlowError("EXIT_GATE",409);
 const select=closing?{evidenceMode:"library",evidenceSelection:{evidenceId:state.proof!.evidenceId,versionId:state.proof!.versionId}}:input;
 const selection=await prepareWorkflowSelection(env,actor,select,{},!started);
 if(!started&&!closing){
   if(typeof input.accessRevoked!=="boolean"||typeof input.dataReturned!=="boolean")throw new SupplierFlowError("EXIT_INPUT");
   const e=selection.evidence;
   const code=e?await db.prepare("SELECT code FROM simple_grc_record_codes WHERE record_id=?").bind(e.evidenceId).first<{code:string}>():null;
   state={...state,accessRevoked:input.accessRevoked,dataReturned:input.dataReturned,preparedBy:actor.email,proof:e?{evidenceId:e.evidenceId,versionId:e.id,versionNo:e.versionNo,sha256:e.contentSha256,title:e.evidenceTitle,code:code?.code||""}:input.clearProof===true?null:state.proof};
 }
 const core=await db.prepare("SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Tedarikçiler'").bind(id).first<{data_json:string;updated_at:string}>();
 if(!core)throw new SupplierFlowError("EXIT_STATE",409);
 if(closing){
   if(await db.prepare("SELECT 1 FROM third_party_findings WHERE vendor_id=? AND status!='closed' LIMIT 1").bind(id).first())throw new SupplierFlowError("EXIT_CAPA",409);
   state={...state,approvedBy:actor.email,approvedAt:now,openFindings:0};
 }
 const guard=joinWorkflowGuards(selection.guard,{sql:"EXISTS (SELECT 1 FROM simple_grc_records WHERE id=? AND module='Tedarikçiler' AND data_json IS ? AND updated_at IS ?)",values:[id,core.data_json,core.updated_at]},
   closing?{sql:"NOT EXISTS (SELECT 1 FROM third_party_findings WHERE vendor_id=? AND status!='closed')",values:[id]}:undefined);
 const event=crypto.randomUUID(),status=closing?"offboarded":"offboarding",kind=started?"exit-started":closing?"vendor-offboard":"exit-prepared";
 await commitLifecycle(db,lifecycleClaim(db,"third_party_profiles","status=?,updated_at=?,updated_by=?",[status,now,actor.email],p,guard,"vendor_id"),[
   ...(closing||started?[db.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status',?),updated_at=? WHERE id=? AND changes()=1").bind(closing?"Offboarded":"Offboarding",nextLifecycleStamp(core.updated_at),id)]:[]),
   lifecycleInsert(db,"third_party_events",{id:event,vendor_id:id,action:kind,detail:JSON.stringify({...state,...(closing?{businessOwner:p.business_owner,riskOwner:p.risk_owner,reviewer:p.reviewer}:{} )}),actor:actor.email,created_at:now}),
   ...workflowPinStatement(db,selection,"tprm",id,closing?"vendor-offboard":"exit-receipt",event,actor.email)
 ]);
 return {ok:true,status};
}
