import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { demoSeeds } from "./demo-seeds";
import { formatRecordCode,recordCodePrefixes,type RecordCodeModule } from "../../record-codes";

const table=`CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const metadataTable=`CREATE TABLE IF NOT EXISTS simple_grc_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const auditsTable=`CREATE TABLE IF NOT EXISTS simple_audits (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,template TEXT NOT NULL,audit_type TEXT NOT NULL,auditor TEXT NOT NULL,audit_owner TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const recordCodesTable=`CREATE TABLE IF NOT EXISTS simple_grc_record_codes (record_id TEXT PRIMARY KEY,module TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`;
const recordCodeCountersTable=`CREATE TABLE IF NOT EXISTS simple_grc_record_code_counters (module TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`;
const modules=["Risk Assessment","BIA","Varlık Envanteri","Uyum","Tedarikçiler","Kontroller","Kanıtlar","Denetim Yönetimi"] as const;
type ModuleName=(typeof modules)[number];
type Data=Record<string,unknown>;
const required:Record<ModuleName,string[]>={
 "Risk Assessment":["title","category","businessUnit","owner","asset","inherentLikelihood","inherentImpact","treatment","status","nextReview"],
 BIA:["process","processCategory","businessUnit","owner","criticality","asset","rto","rpo"],
 "Varlık Envanteri":["title","assetType","businessUnit","owner","criticality","status"],
 Uyum:["framework","controlRef","controlTitle","owner","status"],
 Tedarikçiler:["title","service","owner","criticality","riskLevel","status"],
 Kontroller:["controlRef","controlTitle","owner","frequency","status"],
 Kanıtlar:["evidenceTitle","controlRef","owner","period"],
 "Denetim Yönetimi":["auditName","auditType","auditOwner","startDate","endDate","requirementRef","requirementTitle","owner","businessUnit","dueDate","status","progress"]
};
const seeds:[string,ModuleName,Data][]=demoSeeds;
const demoSeedMarker="demo_seed_initialized";
const compactDataMarker="remove_imported_workbook_and_compact_samples_2026_08";
async function db(){const {env}=await import("cloudflare:workers");await env.DB.batch([env.DB.prepare(table),env.DB.prepare(metadataTable),env.DB.prepare(auditsTable),env.DB.prepare(recordCodesTable),env.DB.prepare(recordCodeCountersTable)]);return env.DB}
export function shouldInsertDemoSeeds(marker:unknown,total:number){return !marker&&total===0}
async function reserveRecordCodes(d:Awaited<ReturnType<typeof db>>,module:ModuleName,count:number,now:string){
 if(count<1)return [];
 await d.prepare("INSERT OR IGNORE INTO simple_grc_record_code_counters(module,value,updated_at) VALUES(?,0,?)").bind(module,now).run();
 const prior=await d.prepare("SELECT code FROM simple_grc_record_codes WHERE module=?").bind(module).all<{code:string}>(),prefix=recordCodePrefixes[module],highest=(prior.results||[]).reduce((max,row)=>{const match=String(row.code).match(new RegExp(`^${prefix}-(\\d+)$`));return match?Math.max(max,Number(match[1])):max},0);
 await d.prepare("UPDATE simple_grc_record_code_counters SET value=CASE WHEN value<? THEN ? ELSE value END,updated_at=? WHERE module=?").bind(highest,highest,now,module).run();
 const counter=await d.prepare("UPDATE simple_grc_record_code_counters SET value=value+?,updated_at=? WHERE module=? RETURNING value").bind(count,now,module).first<{value:number}>();
 if(!counter)throw new Error("RECORD_CODE_ALLOCATION_FAILED");
 const start=Number(counter.value)-count+1;
 return Array.from({length:count},(_,index)=>formatRecordCode(module as RecordCodeModule,start+index));
}
async function ensureRecordCodes(d:Awaited<ReturnType<typeof db>>,rows:Record<string,unknown>[],now:string){
 const existing=await d.prepare("SELECT record_id,code FROM simple_grc_record_codes").all<{record_id:string;code:string}>(),known=new Map((existing.results||[]).map(row=>[String(row.record_id),String(row.code)]));
 for(const moduleName of modules){
  const missing=rows.filter(row=>row.module===moduleName&&!known.has(String(row.id)));
  if(!missing.length)continue;
  const codes=await reserveRecordCodes(d,moduleName,missing.length,now);
  for(let index=0;index<missing.length;index+=75){
   await d.batch(missing.slice(index,index+75).map((row,offset)=>d.prepare("INSERT OR IGNORE INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(?,?,?,?)").bind(String(row.id),moduleName,codes[index+offset],now)));
  }
 }
 const result=await d.prepare("SELECT record_id,code FROM simple_grc_record_codes").all<{record_id:string;code:string}>();
 return new Map((result.results||[]).map(row=>[String(row.record_id),String(row.code)]));
}
async function compactSampleRecords(d:Awaited<ReturnType<typeof db>>,now:string){
 const applied=await d.prepare("SELECT value FROM simple_grc_metadata WHERE key=?").bind(compactDataMarker).first();
 if(applied)return;
 await d.batch([d.prepare("DELETE FROM simple_grc_records WHERE id LIKE 'SOC2-AUD-%' OR id LIKE 'SOC2-CTL-%'"),d.prepare("DELETE FROM simple_audits WHERE name=? OR template LIKE ?").bind("SOC 2 Type II – 2026","%ODINE%"),d.prepare("DELETE FROM simple_grc_metadata WHERE key IN ('soc2_odine_v1','listed_company_risk_assets_2026_08')")]);
 for(let i=0;i<seeds.length;i+=50)await d.batch(seeds.slice(i,i+50).map(([id,module,data])=>d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,module,JSON.stringify(data),now,now)));
 await d.prepare("INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(compactDataMarker,"1",now).run();
}
export function cleanText(value:unknown,max=1000){return typeof value==="string"?value.trim().slice(0,max):value}
export function validModule(value:unknown):value is ModuleName{return typeof value==="string"&&modules.includes(value as ModuleName)}
export function validDate(value:unknown){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
export function validate(module:unknown,input:unknown){
 if(!validModule(module))return {error:"Geçersiz modül."};
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Geçersiz kayıt verisi."};
 const source=input as Data,data:Data={};
 for(const [key,value] of Object.entries(source)){if(key.length>60)continue;data[key]=cleanText(value)}
 if(module==="Risk Assessment"){delete data.likelihood;delete data.impact}
 if(module==="BIA"&&!data.processCategory)data.processCategory="Operasyonel Süreç";
 const missing=required[module].filter(key=>data[key]===undefined||data[key]===null||data[key]==="");
 if(missing.length)return {error:`Zorunlu alanlar eksik: ${missing.join(", ")}`};
 for(const key of ["inherentLikelihood","inherentImpact","confidentialityImpact","integrityImpact","availabilityImpact","confidentialityRating","integrityRating","availabilityRating","financial","operational","legal","reputation","customer","dataImpact"]){
  if(data[key]!==undefined&&data[key]!==""&&(!Number.isInteger(Number(data[key]))||Number(data[key])<1||Number(data[key])>5))return {error:`${key} 1-5 arasında olmalıdır.`};
 }
 if(module==="Denetim Yönetimi"&&(!Number.isInteger(Number(data.progress))||Number(data.progress)<0||Number(data.progress)>100))return {error:"progress 0-100 arasında olmalıdır."};
 if(data.ownerEmail&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.ownerEmail))||String(data.ownerEmail).length>254))return {error:"Geçersiz risk sahibi e-posta adresi."};
 for(const key of ["targetDate","lastReview","nextReview","contractEnd","eolDate","lastTestDate","nextTestDate","startDate","endDate","dueDate","approvalDate","acquisitionDate","lastAssessment","nextAssessment","collectedAt","expiresAt"])if(data[key]&&!validDate(data[key]))return {error:`Geçersiz tarih: ${key}`};
 if(data.lastReview&&data.nextReview&&String(data.nextReview)<String(data.lastReview))return {error:"Sonraki değerlendirme tarihi son değerlendirmeden önce olamaz."};
 if(data.startDate&&data.endDate&&String(data.endDate)<String(data.startDate))return {error:"Denetim bitiş tarihi başlangıç tarihinden önce olamaz."};
 const encoded=JSON.stringify(data);if(encoded.length>100_000)return {error:"Kayıt verisi izin verilen boyutu aşıyor."};
 return {module,data};
}
function readJson(req:NextRequest){const len=Number(req.headers.get("content-length")||0);if(len>2_000_000)throw new Error("PAYLOAD_TOO_LARGE");return req.json()}

export async function GET(req:NextRequest){const auth=await requireRole(req,["Admin","Editor","Viewer"]);if(auth.response)return auth.response;const d=await db();const marker=await d.prepare("SELECT value FROM simple_grc_metadata WHERE key=?").bind(demoSeedMarker).first<{value:string}>(),c=await d.prepare("SELECT COUNT(*) total FROM simple_grc_records").first<{total:number}>(),now=new Date().toISOString();if(shouldInsertDemoSeeds(marker,Number(c?.total||0))){await d.batch(seeds.map(s=>d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(s[0],s[1],JSON.stringify(s[2]),now,now)))}if(!marker){await d.prepare("INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(demoSeedMarker,"1",now).run()}await compactSampleRecords(d,now);const r=await d.prepare("SELECT * FROM simple_grc_records ORDER BY created_at,id LIMIT 5000").all<Record<string,unknown>>(),codes=await ensureRecordCodes(d,r.results,now);const rows:Record<string,unknown>[]=r.results.map(row=>{try{const data=JSON.parse(String(row.data_json)) as Data;if(row.module==="Risk Assessment"){if(data.inherentLikelihood===undefined&&data.likelihood!==undefined)data.inherentLikelihood=data.likelihood;if(data.inherentImpact===undefined&&data.impact!==undefined)data.inherentImpact=data.impact;delete data.likelihood;delete data.impact}if(row.module==="BIA"&&!data.processCategory)data.processCategory="Operasyonel Süreç";return {...row,record_code:codes.get(String(row.id))||String(row.id),data_json:JSON.stringify(data)}}catch{return {...row,record_code:codes.get(String(row.id))||String(row.id)}}});rows.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));return NextResponse.json({rows})}
export async function POST(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 try{
  const d=await db(),b=await readJson(req),now=new Date().toISOString();
  if(!validModule(b.module))return NextResponse.json({error:"Geçersiz modül."},{status:400});
  const moduleName:ModuleName=b.module;
  if(Array.isArray(b.rows)){
   if(b.rows.length<1||b.rows.length>1000)return NextResponse.json({error:"İçe aktarma 1-1000 satır arasında olmalıdır."},{status:400});
   const validated=b.rows.map((row:unknown)=>validate(moduleName,row));const bad=validated.findIndex((x:ReturnType<typeof validate>)=>"error" in x);
   if(bad>=0)return NextResponse.json({error:`Satır ${bad+1}: ${validated[bad].error}`},{status:400});
   const codes=await reserveRecordCodes(d,moduleName,validated.length,now),records:{id:string;code:string;data:Data}[]=validated.map((x:ReturnType<typeof validate>,index:number)=>({id:`${recordCodePrefixes[moduleName]}-${crypto.randomUUID()}`,code:codes[index],data:"data" in x?x.data:{}}));
   for(let i=0;i<records.length;i+=35)await d.batch(records.slice(i,i+35).flatMap((record:{id:string;code:string;data:Data})=>[d.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(record.id,moduleName,JSON.stringify(record.data),now,now),d.prepare("INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(?,?,?,?)").bind(record.id,moduleName,record.code,now)]));
   return NextResponse.json({ok:true,imported:records.length},{status:201});
  }
  const checked=validate(moduleName,b.data);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});
  const id=`${recordCodePrefixes[moduleName]}-${crypto.randomUUID()}`,code=(await reserveRecordCodes(d,moduleName,1,now))[0];await d.batch([d.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,moduleName,JSON.stringify(checked.data),now,now),d.prepare("INSERT INTO simple_grc_record_codes(record_id,module,code,created_at) VALUES(?,?,?,?)").bind(id,moduleName,code,now)]);return NextResponse.json({ok:true,id,code},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="PAYLOAD_TOO_LARGE"?"İstek boyutu çok büyük.":"Geçersiz JSON isteği."},{status:400})}
}
export async function PATCH(req:NextRequest){const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;try{const d=await db(),b=await readJson(req);if(typeof b.id!=="string"||b.id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});const existing=await d.prepare("SELECT module FROM simple_grc_records WHERE id=?").bind(b.id).first<{module:string}>();if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});const checked=validate(existing.module,b.data);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});await d.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(checked.data),new Date().toISOString(),b.id).run();return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"Geçersiz JSON isteği."},{status:400})}}
export async function DELETE(req:NextRequest){const auth=await requireRole(req,["Admin"]);if(auth.response)return auth.response;const id=req.nextUrl.searchParams.get("id");if(!id||id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});const d=await db(),existing=await d.prepare("SELECT id FROM simple_grc_records WHERE id=?").bind(id).first();if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});await d.batch([d.prepare("DELETE FROM simple_grc_record_codes WHERE record_id=?").bind(id),d.prepare("DELETE FROM simple_grc_records WHERE id=?").bind(id)]);return NextResponse.json({ok:true})}
