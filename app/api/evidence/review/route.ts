import {NextRequest,NextResponse} from "next/server";
import {requireRole} from "../../auth/security";
import {ensureEvidenceHistorySchema,verifyEvidenceVersionChainWithAnchor,type EvidenceVersionRow} from "../../../evidence/versioning";
import {evidenceReviewerIsIndependent} from "../../../evidence/intake";
import {nextLifecycleStamp} from "../../../enterprise-lifecycle-write";
const reply=(code:string,status:number)=>NextResponse.json({code},{status});
export async function POST(req:NextRequest){
  const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
  const body=await req.json().catch(()=>null);
  if(typeof body?.id!=="string"||typeof body.expectedUpdatedAt!=="string"||!Number.isSafeInteger(body.version)||body.version<1)return reply("INVALID_REVIEW",400);
  const {env:{DB:db}}=await import("cloudflare:workers");await ensureEvidenceHistorySchema(db);
  const record=await db.prepare("SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Kanıtlar'").bind(body.id).first<{data_json:string;updated_at:string}>();
  if(!record)return reply("NOT_FOUND",404);
  const data=JSON.parse(record.data_json);
  if(!evidenceReviewerIsIndependent(data,auth.actor))return reply("INDEPENDENT_REVIEWER_REQUIRED",403);
  if(data.status!=="İncelemede"||Number(data.versionNo)!==body.version||record.updated_at!==body.expectedUpdatedAt)return reply("RECORD_CHANGED",409);
  const versions=(await db.prepare("SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no").bind(body.id).all<EvidenceVersionRow>()).results;
  const head=versions.at(-1);
  if(!head||head.file_key!==data.fileKey||head.content_sha256!==data.contentSha256||
    (await verifyEvidenceVersionChainWithAnchor(versions,{versionNo:data.versionNo,chainSha256:data.versionChainSha256})).state!=="verified")return reply("UNVERIFIED_VERSION",409);
  if(!evidenceReviewerIsIndependent(data,auth.actor,[versions[0].created_by,head.created_by]))return reply("INDEPENDENT_REVIEWER_REQUIRED",403);
  const now=nextLifecycleStamp(record.updated_at);
  const next={...data,status:"Onaylandı",reviewStatus:"approved",reviewedBy:auth.actor.email,reviewedAt:now,reviewedVersion:head.id};
  const result=await db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module='Kanıtlar'
    AND updated_at=? AND data_json=? AND (SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1)=?
    AND EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id
      WHERE u.id=? AND lower(u.email)=lower(?) AND u.status='Active' AND u.role IN ('Admin','Editor')
      AND (u.role='Admin' OR a.user_id IS NULL OR CASE WHEN json_valid(a.policy_json)
        THEN (json_extract(a.policy_json,'$.mode')='full' OR json_extract(a.policy_json,'$.modules.Kanıtlar')='write') END))`)
    .bind(JSON.stringify(next),now,body.id,record.updated_at,record.data_json,body.id,head.id,auth.actor.id,auth.actor.email).run();
  return result.meta?.changes?NextResponse.json({ok:true}):reply("RECORD_CHANGED",409);
}
