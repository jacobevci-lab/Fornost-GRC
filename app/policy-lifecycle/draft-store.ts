import {canonicalCoreReferenceValues,coreReferenceGuard} from "../core-reference-write";
import {lifecycleInsert} from "../enterprise-lifecycle-write";
import type {validatePolicyVersion} from "./domain";

type Draft=ReturnType<typeof validatePolicyVersion>;
export function draftReferences(id:string,version:Draft){
 const groups=[
  {field:"control_refs_json",values:version.controlRefs,modules:["Kontroller","Uyum"]},
  {field:"risk_refs_json",values:version.riskRefs,modules:["Risk Assessment"]},
 ];
 return coreReferenceGuard(groups.flatMap(group=>canonicalCoreReferenceValues(group.values)
  .map(value=>({sourceId:id,field:group.field,value,modules:group.modules}))));
}
export function insertDraftVersion(db:D1Database,version:Draft,id:string,number:number,digest:string,actor:string,stamp:string){
 return lifecycleInsert(db,"policy_versions",{
  id,policy_id:version.policyId,version_number:number,summary:version.summary,content:version.content,content_sha256:digest,
  control_refs_json:JSON.stringify(version.controlRefs),regulation_refs_json:JSON.stringify(version.regulationRefs),risk_refs_json:JSON.stringify(version.riskRefs),
  effective_date:version.effectiveDate,status:"draft",created_by:actor,created_at:stamp,updated_by:actor,updated_at:stamp
 });
}
