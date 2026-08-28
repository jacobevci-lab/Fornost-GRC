import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../auth/security";

const table=`CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const filesTable=`CREATE TABLE IF NOT EXISTS simple_evidence_files (file_key TEXT PRIMARY KEY,file_name TEXT NOT NULL,content_type TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL)`;
const allowedTypes=["application/pdf","image/png","image/jpeg","image/webp"];

export async function POST(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor"]);if(auth.response)return auth.response;
 const length=Number(req.headers.get("content-length")||0);if(length>11*1024*1024)return NextResponse.json({error:"İstek boyutu çok büyük."},{status:413});
 const {env}=await import("cloudflare:workers");
 await env.DB.batch([env.DB.prepare(table),env.DB.prepare(filesTable)]);
 const fd=await req.formData(),file=fd.get("file");if(!(file instanceof File))return NextResponse.json({error:"Dosya gerekli"},{status:400});
 if(file.size<1||file.size>10*1024*1024||!allowedTypes.includes(file.type))return NextResponse.json({error:"Yalnız PDF/JPG/PNG/WebP ve en fazla 10 MB dosya yüklenebilir."},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer()),head=[...bytes.slice(0,12)];
 const valid=file.type==="application/pdf"?String.fromCharCode(...head.slice(0,5))==="%PDF-":file.type==="image/png"?head.slice(0,8).join(",")==="137,80,78,71,13,10,26,10":file.type==="image/jpeg"?head[0]===255&&head[1]===216&&head[2]===255:String.fromCharCode(...head.slice(0,4))==="RIFF"&&String.fromCharCode(...head.slice(8,12))==="WEBP";
 if(!valid)return NextResponse.json({error:"Dosya içeriği bildirilen türle eşleşmiyor."},{status:400});
 for(const field of ["evidenceTitle","controlRef","owner","period"])if(!String(fd.get(field)||"").trim())return NextResponse.json({error:`Zorunlu alan eksik: ${field}`},{status:400});
 const id=`EVD-${crypto.randomUUID()}`,safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"evidence",key=`evidence/${id}/${safeName}`;
 if(env.BUCKET)await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:file.type}});
 else await env.DB.prepare("INSERT INTO simple_evidence_files(file_key,file_name,content_type,content,created_at) VALUES(?,?,?,?,?)").bind(key,safeName,file.type,bytes,new Date().toISOString()).run();
 const data:Record<string,string>={fileKey:key,fileName:safeName,fileType:file.type};for(const [k,v] of fd.entries())if(k!=="file"&&typeof v==="string")data[k]=v.trim().slice(0,2000);
 const now=new Date().toISOString();await env.DB.prepare("INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,"Kanıtlar",JSON.stringify(data),now,now).run();
 return NextResponse.json({ok:true,id},{status:201});
}

export async function GET(req:NextRequest){
 const auth=await requireRole(req,["Admin","Editor","Viewer"]);if(auth.response)return auth.response;
 const {env}=await import("cloudflare:workers"),key=req.nextUrl.searchParams.get("key");
 if(!key||!key.startsWith("evidence/")||key.includes(".."))return new NextResponse("Bulunamadı",{status:404});
 let body:BodyInit|null=null,type="application/octet-stream",fileName=key.split("/").pop()||"evidence";
 if(env.BUCKET){const obj=await env.BUCKET.get(key);if(obj){body=obj.body;type=obj.httpMetadata?.contentType||type;}}
 if(!body){await env.DB.prepare(filesTable).run();const stored=await env.DB.prepare("SELECT file_name,content_type,content FROM simple_evidence_files WHERE file_key=?").bind(key).first<{file_name:string;content_type:string;content:ArrayBuffer}>();if(stored){body=stored.content;type=stored.content_type;fileName=stored.file_name;}}
 if(!body)return new NextResponse("Bulunamadı",{status:404});
 const inline=req.nextUrl.searchParams.get("inline")==="1"&&(type.startsWith("image/")||type==="application/pdf");
 return new NextResponse(body,{headers:{"content-type":type,"content-disposition":`${inline?"inline":"attachment"}; filename=\"${fileName.replace(/[\"\\]/g,"_")}\"`,"x-content-type-options":"nosniff","cache-control":"private, no-store","content-security-policy":"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"}});
}
