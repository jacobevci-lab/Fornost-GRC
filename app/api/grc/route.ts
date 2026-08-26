import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { demoSeeds } from "./demo-seeds";
import { soc2TemplateControls, soc2TemplateMeta } from "./soc2-template";

const table=`CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const migrationTable=`CREATE TABLE IF NOT EXISTS simple_grc_migrations (id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)`;
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
const prefixes:Record<ModuleName,string>={"Risk Assessment":"RSK",BIA:"BIA","Varlık Envanteri":"AST",Uyum:"CMP",Tedarikçiler:"VEN",Kontroller:"CTL",Kanıtlar:"EVD","Denetim Yönetimi":"AUD"};
const seeds:[string,ModuleName,Data][]=demoSeeds;
async function db(){const {env}=await import("cloudflare:workers");await env.DB.batch([env.DB.prepare(table),env.DB.prepare(migrationTable)]);return env.DB}
async function applyReferenceDataMigration(d:Awaited<ReturnType<typeof db>>,now:string){
 const migrationId="2026-08-listed-company-risk-assets";
 const applied=await d.prepare("SELECT id FROM simple_grc_migrations WHERE id=?").bind(migrationId).first();
 if(applied)return;
 const additions=seeds.filter(([id,module])=>module==="Varlık Envanteri"&&Number(String(id).split("-")[1])>=13);
 await d.batch([
  ...additions.map(([id,module,data])=>d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,module,JSON.stringify(data),now,now)),
  d.prepare("INSERT OR IGNORE INTO simple_grc_migrations(id,applied_at) VALUES(?,?)").bind(migrationId,now),
 ]);
}
function soc2Status(status:string){
 const normalized=status.toLocaleLowerCase("tr-TR");
 if(normalized==="uygun")return {status:"Tamamlandı",progress:100,evidenceStatus:"Kabul Edildi",designEffectiveness:"Etkili"};
 if(normalized==="eksik")return {status:"Başlanmadı",progress:0,evidenceStatus:"Kanıt Bekleniyor",designEffectiveness:"Etkisiz"};
 return {status:"Devam Ediyor",progress:50,evidenceStatus:"İncelemede",designEffectiveness:"Kısmen Etkili"};
}
async function applySoc2TemplateMigration(d:Awaited<ReturnType<typeof db>>,now:string){
 const migrationId="2026-08-soc2-odine-v1";
 const applied=await d.prepare("SELECT id FROM simple_grc_migrations WHERE id=?").bind(migrationId).first();
 if(applied)return;
 const statements=soc2TemplateControls.flatMap((control)=>{
  const assessment=soc2Status(control.consultantStatus),safeId=control.tscId.replace(/[^a-zA-Z0-9]+/g,"-");
  const common={
   frameworkTemplate:soc2TemplateMeta.name,templateVersion:"v1",tscCategory:control.tscCategory,
   exampleControls:control.exampleControls,performingControls:control.performingControls,controlOwner:control.controlOwner,
   controlType:control.controlType,nature:control.nature,isoAnnex:control.isoAnnex,isoControlTitles:control.isoControlTitles,
   isoClauses:control.isoClauses,iso22301:control.iso22301,expectedEvidence:control.expectedEvidence,
   typeIITestApproach:control.typeIITestApproach,currentDocuments:control.currentDocuments,gapNote:control.gapNote,
   requiredAction:control.requiredAction,consultantStatus:control.consultantStatus,source:control.source,
  };
  const controlRecord={controlRef:control.tscId,standardRef:control.tscId,controlTitle:control.expectation,
   description:control.performingControls,owner:control.controlOwner,frequency:control.frequency,
   frameworks:"SOC 2 Type II, ISO/IEC 27001:2022, ISO 22301:2019",implementation:control.consultantStatus,
   lastTestDate:"",testResult:"Test Bekliyor",status:"Aktif",...common};
  const auditRecord={auditName:soc2TemplateMeta.auditName,auditType:"SOC Denetimi",auditor:"Bağımsız Denetim / Hazırlık",
   auditOwner:"Bilgi Güvenliği",startDate:soc2TemplateMeta.startDate,endDate:soc2TemplateMeta.endDate,
   requirementRef:control.tscId,requirementTitle:control.expectation,owner:control.controlOwner,
   businessUnit:control.controlOwner.split("/")[0].trim()||"Bilgi Güvenliği",dueDate:soc2TemplateMeta.endDate,
   status:assessment.status,progress:assessment.progress,evidenceStatus:assessment.evidenceStatus,controlRef:control.tscId,
   riskRef:"",evidenceRef:"",responsibleNote:control.requiredAction,auditorFeedback:"",finding:control.gapNote,
   delayReason:"",scopeCategory:control.tscCategory.split("/")[0].trim(),designEffectiveness:assessment.designEffectiveness,
   operatingEffectiveness:"Test Bekliyor",testOwner:"",testDate:"",populationSize:"",sampleSize:"",exceptions:"",
   auditorResult:"Bekliyor",recordKind:"ControlAssessment",...common};
  return [
   d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(`SOC2-CTL-${safeId}`,"Kontroller",JSON.stringify(controlRecord),now,now),
   d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(`SOC2-AUD-${safeId}`,"Denetim Yönetimi",JSON.stringify(auditRecord),now,now),
  ];
 });
 for(let i=0;i<statements.length;i+=50)await d.batch(statements.slice(i,i+50));
 await d.prepare("INSERT OR IGNORE INTO simple_grc_migrations(id,applied_at) VALUES(?,?)").bind(migrationId,now).run();
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
 for(const key of ["targetDate","lastReview","nextReview","contractEnd","eolDate","lastTestDate","nextTestDate","startDate","endDate","dueDate","approvalDate","acquisitionDate","testDate"])if(data[key]&&!validDate(data[key]))return {error:`Geçersiz tarih: ${key}`};
 if(data.lastReview&&data.nextReview&&String(data.nextReview)<String(data.lastReview))return {error:"Sonraki değerlendirme tarihi son değerlendirmeden önce olamaz."};
 if(data.startDate&&data.endDate&&String(data.endDate)<String(data.startDate))return {error:"Denetim bitiş tarihi başlangıç tarihinden önce olamaz."};
 const encoded=JSON.stringify(data);if(encoded.length>100_000)return {error:"Kayıt verisi izin verilen boyutu aşıyor."};
 return {module,data};
}
function readJson(req:NextRequest){const len=Number(req.headers.get("content-length")||0);if(len>2_000_000)throw new Error("PAYLOAD_TOO_LARGE");return req.json()}

export async function GET(req:NextRequest){const auth=await requireRole(req,["Admin","Editor","Viewer"]);if(auth.response)return auth.response;const d=await db();const c=await d.prepare("SELECT COUNT(*) total FROM simple_grc_records").first<{total:number}>(),now=new Date().toISOString();if(!c?.total){await d.batch(seeds.map(s=>d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(s[0],s[1],JSON.stringify(s[2]),now,now)))}else{const auditCount=await d.prepare("SELECT COUNT(*) total FROM simple_grc_records WHERE module='Denetim Yönetimi'").first<{total:number}>();if(!auditCount?.total){const sample=seeds.find(s=>s[1]==="Denetim Yönetimi");if(sample)await d.prepare("INSERT OR IGNORE INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(sample[0],sample[1],JSON.stringify(sample[2]),now,now).run()}}await applyReferenceDataMigration(d,now);await applySoc2TemplateMigration(d,now);const demoEvidence=seeds.filter(s=>s[1]==="Kanıtlar"&&String(s[0]).startsWith("EVD-"));await d.batch(demoEvidence.map(s=>d.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module=\'Kanıtlar\'").bind(JSON.stringify(s[2]),now,s[0])));const r=await d.prepare("SELECT * FROM simple_grc_records ORDER BY updated_at DESC LIMIT 5000").all<Record<string,unknown>>();const rows=r.results.map(row=>{try{const data=JSON.parse(String(row.data_json)) as Data;if(row.module==="Risk Assessment"){if(data.inherentLikelihood===undefined&&data.likelihood!==undefined)data.inherentLikelihood=data.likelihood;if(data.inherentImpact===undefined&&data.impact!==undefined)data.inherentImpact=data.impact;delete data.likelihood;delete data.impact}if(row.module==="BIA"&&!data.processCategory)data.processCategory="Operasyonel Süreç";return {...row,data_json:JSON.stringify(data)}}catch{return row}});return NextResponse.json({rows})}
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
   const statements=validated.map((x:ReturnType<typeof validate>)=>d.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(`${prefixes[moduleName]}-${crypto.randomUUID()}`,moduleName,JSON.stringify("data" in x?x.data:{}),now,now));
   for(let i=0;i<statements.length;i+=75)await d.batch(statements.slice(i,i+75));
   return NextResponse.json({ok:true,imported:statements.length},{status:201});
  }
  const checked=validate(moduleName,b.data);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});
  const id=`${prefixes[moduleName]}-${crypto.randomUUID()}`;await d.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,moduleName,JSON.stringify(checked.data),now,now).run();return NextResponse.json({ok:true,id},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="PAYLOAD_TOO_LARGE"?"İstek boyutu çok büyük.":"Geçersiz JSON isteği."},{status:400})}
}
export async function PATCH(req:NextRequest){const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;try{const d=await db(),b=await readJson(req);if(typeof b.id!=="string"||b.id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});const existing=await d.prepare("SELECT module FROM simple_grc_records WHERE id=?").bind(b.id).first<{module:string}>();if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});const checked=validate(existing.module,b.data);if("error" in checked)return NextResponse.json({error:checked.error},{status:400});await d.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(checked.data),new Date().toISOString(),b.id).run();return NextResponse.json({ok:true})}catch{return NextResponse.json({error:"Geçersiz JSON isteği."},{status:400})}}
export async function DELETE(req:NextRequest){const auth=await requireRole(req,["Admin"]);if(auth.response)return auth.response;const id=req.nextUrl.searchParams.get("id");if(!id||id.length>100)return NextResponse.json({error:"Geçersiz kayıt kimliği."},{status:400});const d=await db(),existing=await d.prepare("SELECT id FROM simple_grc_records WHERE id=?").bind(id).first();if(!existing)return NextResponse.json({error:"Kayıt bulunamadı."},{status:404});await d.prepare("DELETE FROM simple_grc_records WHERE id=?").bind(id).run();return NextResponse.json({ok:true})}
