import {appendEvidenceVersion,sha256HexBytes} from "./versioning";
import {pendingEvidence} from "./intake";
import {EvidenceExecutionConflict} from "./execution-guard";

/** Seal the reviewable JSON report and its links in the same transaction as the run claim. */
export async function commitAutomationReport(db:D1Database,input:{
 id:string; stamp:string; code:string; data:Record<string,unknown>; reviewer:string; owner:string; actor:string;
 claim:D1PreparedStatement; dependent:D1PreparedStatement[];
}){
 const {id,stamp,code,data,reviewer,owner,actor}=input;
 const fileName=code+".json",fileKey="evidence/"+id+"/v1-"+fileName,fileType="application/json";
 const report={rule:data.automationRuleId,run:data.automationRunId,controlRefs:data.controlRef,source:data.source,
   collectedAt:stamp,freshUntil:data.freshUntil,result:data.validationStatus,detail:data.validationDetail,
   assessment:data.controlAssessment,responseSha256:data.responseHash};
 const bytes=new TextEncoder().encode(JSON.stringify(report,null,2)),contentSha256=await sha256HexBytes(bytes);
 await appendEvidenceVersion(db,{evidenceId:id,fileKey,fileName,fileType,fileSize:bytes.length,contentSha256,
   evidenceTitle:String(data.evidenceTitle),owner,period:stamp.slice(0,10),frameworks:"",controlRefs:String(data.controlRef),
   changeNote:"Automated collection",createdBy:actor,createdAt:stamp},{
   claim:{statement:()=>input.claim,conflict:async()=>new EvidenceExecutionConflict()},
   additionalStatements:version=>{
     const record={...data,...pendingEvidence,reviewer,owner,uploadedBy:actor,versionUploadedBy:actor,
       fileKey,fileName,fileType,fileSize:String(bytes.length),contentSha256,versionNo:String(version.versionNo),
       versionChainSha256:version.chainSha256,versionUpdatedAt:stamp,expiresAt:data.freshUntil};
     const guard=" WHERE EXISTS(SELECT 1 FROM evidence_versions WHERE id=?)";
     return [...input.dependent,
       db.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) SELECT ?,'Kanıtlar',?,?,?"+guard).bind(id,JSON.stringify(record),stamp,stamp,version.id),
       db.prepare("INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) SELECT ?,'Kanıtlar',?,?"+guard).bind(id,code,stamp,version.id),
       db.prepare("INSERT INTO simple_evidence_files(file_key,file_name,content_type,content,created_at) SELECT ?,?,?,?,?"+guard).bind(fileKey,fileName,fileType,bytes.buffer,stamp,version.id)];
   },
 });
}
