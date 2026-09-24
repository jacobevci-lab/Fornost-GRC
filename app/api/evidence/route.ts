import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { appendEvidenceVersion,sha256HexBytes,splitEvidenceControlRefs,validateEvidenceFile } from "../../evidence/versioning";

const table=`CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const filesTable=`CREATE TABLE IF NOT EXISTS simple_evidence_files (file_key TEXT PRIMARY KEY,file_name TEXT NOT NULL,content_type TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL)`;

export async function POST(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 const length=Number(req.headers.get("content-length")||0);if(length>11*1024*1024)return NextResponse.json({error:"İstek boyutu çok büyük."},{status:413});
 const {env}=await import("cloudflare:workers");
 await env.DB.batch([env.DB.prepare(table),env.DB.prepare(filesTable)]);
 const fd=await req.formData(),file=fd.get("file");if(!(file instanceof File))return NextResponse.json({error:"Dosya gerekli"},{status:400});
 if(file.size<1||file.size>10*1024*1024)return NextResponse.json({error:"Yalnız PDF/JPG/PNG/WebP ve en fazla 10 MB dosya yüklenebilir."},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(!validateEvidenceFile(bytes,file.type))return NextResponse.json({error:"Dosya içeriği bildirilen türle eşleşmiyor veya dosya türü desteklenmiyor."},{status:400});
 for(const field of ["evidenceTitle","controlRef","owner","period"])if(!String(fd.get(field)||"").trim())return NextResponse.json({error:`Zorunlu alan eksik: ${field}`},{status:400});
 const status=String(fd.get("status")||"Taslak").trim(),allowedStatuses=["Taslak","İncelemede","Onaylandı","Reddedildi","Süresi Doldu"];
 if(!allowedStatuses.includes(status))return NextResponse.json({error:"Geçersiz kanıt durumu."},{status:400});
 const id=`EVD-${crypto.randomUUID()}`,safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"evidence",key=`evidence/${id}/v1-${safeName}`;
 const now=new Date().toISOString(),contentSha256=await sha256HexBytes(bytes);
 if(env.BUCKET)await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:file.type}});
 else await env.DB.prepare("INSERT INTO simple_evidence_files(file_key,file_name,content_type,content,created_at) VALUES(?,?,?,?,?)").bind(key,safeName,file.type,bytes,now).run();
 const data:Record<string,string>={fileKey:key,fileName:safeName,fileType:file.type,fileSize:String(file.size),contentSha256,status};for(const [k,v] of fd.entries())if(k!=="file"&&k!=="status"&&typeof v==="string")data[k]=v.trim().slice(0,2000);
 const refs=splitEvidenceControlRefs(data.controlRefs||data.controlRef);data.controlRef=refs[0]||data.controlRef;data.controlRefs=refs.join(", ");
 try{
  const version=await appendEvidenceVersion(env.DB,{evidenceId:id,fileKey:key,fileName:safeName,fileType:file.type,fileSize:file.size,contentSha256,evidenceTitle:data.evidenceTitle,owner:data.owner,period:data.period,frameworks:data.frameworks||"",controlRefs:data.controlRefs,changeNote:"Initial evidence upload",createdBy:auth.actor.email,createdAt:now},{
   additionalStatements:(commit)=>{
    const anchoredData={...data,versionNo:String(commit.versionNo),versionChainSha256:commit.chainSha256,versionUpdatedAt:now};
    return [env.DB.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,"Kanıtlar",JSON.stringify(anchoredData),now,now)];
   },
  });
  return NextResponse.json({ok:true,id,versionNo:version.versionNo,contentSha256,chainSha256:version.chainSha256},{status:201});
 }catch(error){
  try{
   if(env.BUCKET){const bucket=env.BUCKET as unknown as {delete?:(objectKey:string)=>Promise<unknown>};if(bucket.delete)await bucket.delete(key);}
   else await env.DB.prepare("DELETE FROM simple_evidence_files WHERE file_key=?").bind(key).run();
  }catch{}
  return NextResponse.json({error:error instanceof Error?error.message:"Kanıt kaydı oluşturulamadı."},{status:500});
 }
}

export async function GET(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor","Viewer"]);if(auth.response)return auth.response;
 const {env}=await import("cloudflare:workers"),key=req.nextUrl.searchParams.get("key");
 if(!key)return NextResponse.json({error:"key parametresi gerekli."},{status:400,headers:{"cache-control":"no-store"}});
 if(!key.startsWith("evidence/")||key.includes(".."))return new NextResponse("Bulunamadı",{status:404});
 let body:BodyInit|null=null,type="application/octet-stream",fileName=key.split("/").pop()||"evidence";
 if(env.BUCKET){const obj=await env.BUCKET.get(key);if(obj){body=obj.body;type=obj.httpMetadata?.contentType||type;}}
 if(!body){await env.DB.prepare(filesTable).run();const stored=await env.DB.prepare("SELECT file_name,content_type,content FROM simple_evidence_files WHERE file_key=?").bind(key).first<{file_name:string;content_type:string;content:ArrayBuffer}>();if(stored){body=stored.content;type=stored.content_type;fileName=stored.file_name;}}
 if(!body)return new NextResponse("Bulunamadı",{status:404});
 const inline=req.nextUrl.searchParams.get("inline")==="1"&&(type.startsWith("image/")||type==="application/pdf");
 return new NextResponse(body,{headers:{"content-type":type,"content-disposition":`${inline?"inline":"attachment"}; filename=\"${fileName.replace(/[\"\\]/g,"_")}\"`,"x-content-type-options":"nosniff","cache-control":"private, no-store","content-security-policy":"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"}});
}
