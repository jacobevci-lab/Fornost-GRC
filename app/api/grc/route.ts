import {mergeEvidenceStandards,prepareControlMappings,PostureError} from "../../framework-posture/store";
import { previewRegisterImport, commitRegisterImport } from "../../register-import-store";
import { RegisterImportError } from "../../register-import";
import { validModule, normalizeRecordData, validate, type ModuleName, type Data } from "../../core-record-validation";
export { cleanText, validModule, validDate, normalizeRecordData, validate } from "../../core-record-validation";
import {isAuditClosedError,auditClosedMessage} from "../../audit-closure";
import {insertCoreRecords,CoreReferenceUnavailable,CoreSideEffectConflict} from "../../core-reference-write";
import {deleteCoreRecord,CoreRecordLinked} from "../../core-record-delete";
import {writeCoreRecord} from "../../core-record-write";
import {LifecycleConflict} from "../../enterprise-lifecycle-write";
import {parseGrcCursor} from "../../grc-pagination";
import { preserveRiskGovernance } from "../../risk-governance-write";
import { canReadModule,canReadPosture,canWriteModule, isScoped, readableModules } from "../../module-access";
import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { ensureCoreGrcSchemaCompatibility } from "./schema-compat";
import { recordCodePrefixes } from "../../record-codes";
import { reserveRecordCodes } from "../../record-code-store";

async function db(){const {env}=await import("cloudflare:workers");await ensureCoreGrcSchemaCompatibility(env.DB);return env.DB}
async function readJson(req:NextRequest){const len=Number(req.headers.get("content-length")||0);if(len>2_000_000)throw new RegisterImportError("payload-limit",[],413);const raw=await req.text();if(new TextEncoder().encode(raw).length>2_000_000)throw new RegisterImportError("payload-limit",[],413);return JSON.parse(raw)}

export async function GET(req: NextRequest) {
 const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]);
 if (auth.response) return auth.response;
 let cursor;
 try { cursor = parseGrcCursor(req.nextUrl.searchParams.get("cursor")); }
 catch { return NextResponse.json({ error: "Geçersiz sayfalama imleci." }, { status: 400 }); }
 const d = await db();
 const allowed = readableModules(auth.actor);
 const clauses: string[] = [], values: string[] = [];
 if (isScoped(auth.actor)) {
  clauses.push(`module IN (${allowed.map(() => "?").join(",") || "NULL"})`);
  values.push(...allowed);
 }
 if (cursor) {
  clauses.push("(created_at>? OR (created_at=? AND id>?))");
  values.push(cursor.createdAt, cursor.createdAt, cursor.id);
 }
 const choices=req.nextUrl.searchParams.get("automationChoices")==="1";
 if(choices)clauses.push("module IN ('Kontroller','Varlık Envanteri')");
 const fields=choices?`r.id,r.module,r.created_at,r.updated_at,json_object('title',coalesce(json_extract(r.data_json,'$.controlTitle'),json_extract(r.data_json,'$.title'),json_extract(r.data_json,'$.name'),'')) AS data_json`:`r.*,CASE WHEN r.module='Varlık Envanteri' THEN
 (SELECT group_concat(DISTINCT signal) FROM evidence_source_signals WHERE asset_id=r.id) END AS collector_signals`;
 const query = d.prepare(`SELECT ${fields},(SELECT code FROM simple_grc_record_codes WHERE record_id=r.id) AS record_code FROM simple_grc_records r ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY created_at,id LIMIT 5001`).bind(...values);
 const r = await query.all<Record<string, unknown>>(), hasMore = r.results.length > 5000;
 if (hasMore) r.results.pop();
 const last = r.results.at(-1);
 const nextCursor = hasMore && last ? JSON.stringify({ createdAt: String(last.created_at), id: String(last.id) }) : null;
 // Listing must not seed, compact or allocate codes. Explicit Admin sample
 // restore and normal writes own creation; uncoded legacy rows retain their ID.
 const rows: Record<string, unknown>[] = r.results.map(row => {
  const record_code = String(row.record_code || row.id);
  try {
   const data = normalizeRecordData(row.module, JSON.parse(String(row.data_json)) as Data);
   return { ...row, record_code: record_code, data_json: JSON.stringify(data) };
  } catch { return { ...row, record_code: record_code }; }
 });
 rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
 return NextResponse.json({ rows, nextCursor }, { headers: { "cache-control": "private, no-store" } });
}
function controlLinksAllowed(actor:Parameters<typeof canReadModule>[0],module:string,items:unknown[],before:Data={}){
 if(module==="Kanıtlar")return items.every(value=>{
  if(!value||typeof value!=="object")return true;
  const item=value as Data;
  return Object.entries({sourceAssetRef:"Varlık Envanteri",sourceVendorRef:"Tedarikçiler",controlRefs:"Kontroller",controlRef:"Kontroller"}).every(([key,target])=>item[key]===undefined||String(item[key]||"")===String(before[key]||"")||canReadModule(actor,target));
 });
 if(module!=="Kontroller")return true;
 return items.every(item=>!item||typeof item!=="object"||Object.entries({controlRiskRefs:"Risk Assessment",supportingEvidenceRefs:"Kanıtlar"}).every(([key,target])=>
   canReadModule(actor,target)||JSON.stringify((item as Data)[key]??[])===JSON.stringify(before[key]??[])));
}
async function mappings(db:D1Database,actor:Parameters<typeof canReadPosture>[0]&{email:string},module:string,id:string,changes:unknown){
 if(changes===undefined)return;
 if(module!=="Kontroller"||!canReadPosture(actor)||!canWriteModule(actor,"Uyum"))throw new PostureError("forbidden",403);
 return prepareControlMappings(db,id,changes,actor.email);
}
export async function POST(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 let importing=false;
 try{
  const d=await db(),b=await readJson(req),now=new Date().toISOString();
  if(!validModule(b.module))return NextResponse.json({error:"Geçersiz modül."},{status:400});
  const moduleName:ModuleName=b.module;
  importing=b.action==='preview-import'||b.importId!==undefined;
  if(b.action!==undefined&&(b.action!=='preview-import'||b.importId!==undefined))throw new RegisterImportError('import-request');
  if(!canWriteModule(auth.actor,moduleName))return NextResponse.json({error:"Bu modülde yazma yetkiniz yok."},{status:403});
  if(!controlLinksAllowed(auth.actor,moduleName,Array.isArray(b.rows)?b.rows:[b.data]))return NextResponse.json({error:'forbidden'},{status:403});
  if(b.action==='preview-import')return NextResponse.json({ok:true,preview:true,...await previewRegisterImport(d,auth.actor,moduleName,b.rows)},{headers:{'cache-control':'private, no-store'}});
  if(b.importId!==undefined){
   const result=await commitRegisterImport(d,auth.actor,moduleName,b.rows,b.importId,async(module,rows)=>{
    const codes=await reserveRecordCodes(d,module,rows.length,now);
    return rows.map((data,index)=>({id:`${recordCodePrefixes[module]}-${crypto.randomUUID()}`,code:codes[index],data}));
   });
   return NextResponse.json({ok:true,...result},{status:result.replayed?200:201,headers:{'cache-control':'private, no-store'}});
  }
  if(Array.isArray(b.rows)){
   if(b.rows.length<1||b.rows.length>1000)return NextResponse.json({error:"İçe aktarma 1-1000 satır arasında olmalıdır."},{status:400});
   const validated=b.rows.map((row:unknown)=>validate(moduleName,moduleName==="Risk Assessment"&&row&&typeof row==="object"&&!Array.isArray(row)?preserveRiskGovernance(row as Data):row));const bad=validated.findIndex((x:ReturnType<typeof validate>)=>"error" in x);
   if(bad>=0)return NextResponse.json({error:`Satır ${bad+1}: ${validated[bad].error}`},{status:400});
   const codes=await reserveRecordCodes(d,moduleName,validated.length,now),records:{id:string;code:string;data:Data}[]=validated.map((x:ReturnType<typeof validate>,index:number)=>({id:`${recordCodePrefixes[moduleName]}-${crypto.randomUUID()}`,code:codes[index],data:"data" in x?x.data:{}}));
   await insertCoreRecords(d,moduleName,records,now);
   return NextResponse.json({ok:true,imported:records.length},{status:201});
  }
  const checked=validate(moduleName,moduleName==="Risk Assessment"&&b.data&&typeof b.data==="object"&&!Array.isArray(b.data)?preserveRiskGovernance(b.data):b.data);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});
  const id=`${recordCodePrefixes[moduleName]}-${crypto.randomUUID()}`;
  const side=await mappings(d,auth.actor,moduleName,id,b.controlMappings);
  const [code]=await reserveRecordCodes(d,moduleName,1,now);
  await insertCoreRecords(d,moduleName,[{id,code,data:checked.data}],now,undefined,side);return NextResponse.json({ok:true,id,code},{status:201});
 }catch(error){if(error instanceof CoreSideEffectConflict)return NextResponse.json({error:'conflict',code:'MAPPING_CONFLICT'},{status:409});if(error instanceof PostureError)return NextResponse.json({error:error.code,code:'MAPPING_'+error.code.toUpperCase()},{status:error.status});if(error instanceof RegisterImportError)return NextResponse.json({error:error.code,issues:error.issues},{status:error.status});if(isAuditClosedError(error))return NextResponse.json({error:auditClosedMessage,code:"AUDIT_CLOSED"},{status:409});if(error instanceof CoreReferenceUnavailable)return NextResponse.json({error:error.message,code:"REFERENCE_UNAVAILABLE"},{status:422});return NextResponse.json({error:importing?"unavailable":"Geçersiz JSON isteği."},{status:importing?503:400})}
}
export async function PATCH(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 try{
  const d=await db(),b=await readJson(req);if(typeof b.id!=="string"||b.id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});
  const existing=await d.prepare("SELECT module,data_json,updated_at FROM simple_grc_records WHERE id=?").bind(b.id).first<{module:string;data_json:string;updated_at:string}>();
  if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});if(!canWriteModule(auth.actor,existing.module))return NextResponse.json({error:"Bu modülde yazma yetkiniz yok."},{status:403});
  const input=existing.module==="Risk Assessment"&&b.data&&typeof b.data==="object"&&!Array.isArray(b.data)?preserveRiskGovernance(b.data,JSON.parse(existing.data_json)):b.data;
  const before=JSON.parse(existing.data_json);
  if(existing.module==="Kanıtlar" && input && typeof input==="object" && (["status","reviewStatus"].some(key=>input[key]!==undefined&&input[key]!==before[key])))return NextResponse.json({code:"USE_EVIDENCE_REVIEW"},{status:403});
  if(existing.module==="Kanıtlar" && before.versionNo && (!before.uploadedBy||!before.versionUploadedBy)){
   const authors=await d.prepare("SELECT (SELECT created_by FROM evidence_versions WHERE evidence_id=? ORDER BY version_no LIMIT 1) AS uploader,(SELECT created_by FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1) AS currentUploader").bind(b.id,b.id).first<{uploader:string;currentUploader:string}>();
   if(authors?.uploader)before.uploadedBy||=authors.uploader;
   if(authors?.currentUploader)before.versionUploadedBy||=authors.currentUploader;
  }
  if(!controlLinksAllowed(auth.actor,existing.module,[input],before))return NextResponse.json({error:'forbidden'},{status:403});
  const side=await mappings(d,auth.actor,existing.module,b.id,b.controlMappings);
  const checked=validate(existing.module,input,before.status,before);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});
  if(existing.module==="Kanıtlar"&&canReadPosture(auth.actor)&&(checked.data.controlRefs!==before.controlRefs||checked.data.controlRef!==before.controlRef||checked.data.frameworks!==before.frameworks))await mergeEvidenceStandards(d,checked.data);
  const updatedAt=await writeCoreRecord(d,b.id,existing,checked.data,b.expectedUpdatedAt,side);
  return NextResponse.json({ok:true,updatedAt});
 }catch(error){if(error instanceof CoreSideEffectConflict)return NextResponse.json({error:'conflict',code:'MAPPING_CONFLICT'},{status:409});if(error instanceof PostureError)return NextResponse.json({error:error.code,code:'MAPPING_'+error.code.toUpperCase()},{status:error.status});if(error instanceof RegisterImportError)return NextResponse.json({error:error.code,issues:error.issues},{status:error.status});if(isAuditClosedError(error))return NextResponse.json({error:auditClosedMessage,code:"AUDIT_CLOSED"},{status:409});if(error instanceof CoreReferenceUnavailable)return NextResponse.json({error:error.message,code:"REFERENCE_UNAVAILABLE"},{status:422});if(error instanceof LifecycleConflict)return NextResponse.json({error:error.message},{status:409});return NextResponse.json({error:"Geçersiz JSON isteği, kayıt sürümü veya okunamayan kayıt."},{status:400})}
}
export async function DELETE(req:NextRequest){
 const auth=await requireRole(req,["Admin"]);if(auth.response)return auth.response;
 const id=req.nextUrl.searchParams.get("id");if(!id||id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});
 const expected=req.nextUrl.searchParams.get("expectedUpdatedAt");
 if(expected!==null&&(!expected||expected.length>64))return NextResponse.json({error:"Geçersiz kayıt sürümü."},{status:400});
 try{
  const d=await db(),existing=await d.prepare("SELECT module,data_json,updated_at FROM simple_grc_records WHERE id=?").bind(id).first<{module:string;data_json:string;updated_at:string}>();
  if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});
  await deleteCoreRecord(d,id,existing,expected===null?undefined:expected);
  return NextResponse.json({ok:true});
 }catch(error){
  if(isAuditClosedError(error))return NextResponse.json({error:auditClosedMessage,code:"AUDIT_CLOSED"},{status:409});
  if(error instanceof CoreRecordLinked)return NextResponse.json({error:error.message,code:"RECORD_LINKED"},{status:409});
  if(error instanceof LifecycleConflict)return NextResponse.json({error:error.message,code:"RECORD_CHANGED"},{status:409});
  console.error("CORE_DELETE_FAILED",error instanceof Error?error.message:"Unknown database failure");
  return NextResponse.json({error:"Kayıt silinemedi. Tekrar deneyin."},{status:500});
 }
}
