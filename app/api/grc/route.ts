import { previewRegisterImport, commitRegisterImport } from "../../register-import-store";
import { RegisterImportError } from "../../register-import";
import { validModule, normalizeRecordData, validate, type ModuleName, type Data } from "../../core-record-validation";
export { cleanText, validModule, validDate, normalizeRecordData, validate } from "../../core-record-validation";
import {isAuditClosedError,auditClosedMessage} from "../../audit-closure";
import {insertCoreRecords,CoreReferenceUnavailable} from "../../core-reference-write";
import {deleteCoreRecord,CoreRecordLinked} from "../../core-record-delete";
import {writeCoreRecord} from "../../core-record-write";
import {LifecycleConflict} from "../../enterprise-lifecycle-write";
import {parseGrcCursor} from "../../grc-pagination";
import { preserveRiskGovernance } from "../../risk-governance-write";
import { canWriteModule, isScoped, readableModules } from "../../module-access";
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
 const query = d.prepare(`SELECT * FROM simple_grc_records ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY created_at,id LIMIT 5001`).bind(...values);
 const r = await query.all<Record<string, unknown>>(), hasMore = r.results.length > 5000;
 if (hasMore) r.results.pop();
 const last = r.results.at(-1);
 const nextCursor = hasMore && last ? JSON.stringify({ createdAt: String(last.created_at), id: String(last.id) }) : null;
 // Listing must not seed, compact or allocate codes. Explicit Admin sample
 // restore and normal writes own creation; uncoded legacy rows retain their ID.
 const savedCodes = await d.prepare("SELECT record_id,code FROM simple_grc_record_codes").all<{ record_id: string; code: string }>();
 const codes = new Map((savedCodes.results || []).map(row => [row.record_id, row.code]));
 const rows: Record<string, unknown>[] = r.results.map(row => {
  const record_code = codes.get(String(row.id)) || String(row.id);
  try {
   const data = normalizeRecordData(row.module, JSON.parse(String(row.data_json)) as Data);
   return { ...row, record_code: record_code, data_json: JSON.stringify(data) };
  } catch { return { ...row, record_code: record_code }; }
 });
 rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
 return NextResponse.json({ rows, nextCursor }, { headers: { "cache-control": "private, no-store" } });
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
  const id=`${recordCodePrefixes[moduleName]}-${crypto.randomUUID()}`,code=(await reserveRecordCodes(d,moduleName,1,now))[0];await insertCoreRecords(d,moduleName,[{id,code,data:checked.data}],now);return NextResponse.json({ok:true,id,code},{status:201});
 }catch(error){if(error instanceof RegisterImportError)return NextResponse.json({error:error.code,issues:error.issues},{status:error.status});if(isAuditClosedError(error))return NextResponse.json({error:auditClosedMessage,code:"AUDIT_CLOSED"},{status:409});if(error instanceof CoreReferenceUnavailable)return NextResponse.json({error:error.message,code:"REFERENCE_UNAVAILABLE"},{status:422});return NextResponse.json({error:importing?"unavailable":"Geçersiz JSON isteği."},{status:importing?503:400})}
}
export async function PATCH(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 try{
  const d=await db(),b=await readJson(req);if(typeof b.id!=="string"||b.id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});
  const existing=await d.prepare("SELECT module,data_json,updated_at FROM simple_grc_records WHERE id=?").bind(b.id).first<{module:string;data_json:string;updated_at:string}>();
  if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});if(!canWriteModule(auth.actor,existing.module))return NextResponse.json({error:"Bu modülde yazma yetkiniz yok."},{status:403});
  const input=existing.module==="Risk Assessment"&&b.data&&typeof b.data==="object"&&!Array.isArray(b.data)?preserveRiskGovernance(b.data,JSON.parse(existing.data_json)):b.data;
  const checked=validate(existing.module,input);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});
  const updatedAt=await writeCoreRecord(d,b.id,existing,checked.data,b.expectedUpdatedAt);
  return NextResponse.json({ok:true,updatedAt});
 }catch(error){if(error instanceof RegisterImportError)return NextResponse.json({error:error.code,issues:error.issues},{status:error.status});if(isAuditClosedError(error))return NextResponse.json({error:auditClosedMessage,code:"AUDIT_CLOSED"},{status:409});if(error instanceof CoreReferenceUnavailable)return NextResponse.json({error:error.message,code:"REFERENCE_UNAVAILABLE"},{status:422});if(error instanceof LifecycleConflict)return NextResponse.json({error:error.message},{status:409});return NextResponse.json({error:"Geçersiz JSON isteği, kayıt sürümü veya okunamayan kayıt."},{status:400})}
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
