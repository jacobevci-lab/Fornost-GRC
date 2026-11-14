import {ensureCoreGrcSchemaCompatibility} from "../api/grc/schema-compat";
import type {Actor} from "../api/auth/security";
import {JsonBodyError,readBoundedBody} from "../api/request-body";
import {validateEvidenceUpload} from "../evidence/validate-upload";
import {sha256HexBytes} from "../evidence/versioning";
import {prepareWorkflowSelection, WorkflowSelectionError} from "../workflow-selection-store";
import {commitReferencedLifecycle} from "../enterprise-reference-intake";
import {draftReferences,insertDraftVersion} from "./draft-store";
import {CoreReferenceUnavailable} from "../core-reference-write";
import {LifecycleConflict,lifecycleClaim,lifecycleInsert,nextLifecycleStamp} from "../enterprise-lifecycle-write";
import {validatePolicy,validatePolicyVersion} from "./domain";
import {policyImportFileLimit,policyImportTextLimit} from "./import-format";

type Env={DB:D1Database;BUCKET?:R2Bucket};
const chunkSize=128*1024;
type Row=Record<string,string|number|null>;
export class PolicyImportError extends Error {
 constructor(public code:string,public status=400){super(code);}
}
export async function policyImportForm(request:Request){
 let form:FormData;
 try{
  const bytes=await readBoundedBody(request,10*1024*1024+300_000);
  form=await new Response(bytes,{headers:{"content-type":request.headers.get("content-type")||""}}).formData();
 }catch(error){throw new PolicyImportError(error instanceof JsonBodyError&&error.status===413?"size":"file",error instanceof JsonBodyError?error.status:400);}
 const file=form.get("file");
 if(!(file instanceof File)||form.getAll("file").length!==1)throw new PolicyImportError("file");
 const limit=policyImportFileLimit(file.name);
 if(!limit||file.name.length>240||/[\/\\\u0000-\u001f\u007f]/u.test(file.name))throw new PolicyImportError("file");
 if(!file.size||file.size>limit)throw new PolicyImportError("size",413);
 const bytes=new Uint8Array(await file.arrayBuffer());
 let type:string;
 try{type=validateEvidenceUpload(bytes,file.name,file.type);}catch{throw new PolicyImportError("invalid");}
 if(type==="application/pdf"){
  const tail=new TextDecoder("latin1").decode(bytes.subarray(-4096));
  if(!/startxref\s+\d+\s+%%EOF/.test(tail))throw new PolicyImportError("invalid");
 }
 return {form,bytes,name:file.name,type};
}

export async function importPolicyFile(env:Env,actor:Actor,source:Awaited<ReturnType<typeof policyImportForm>>){
 if(actor.role!=="Admin"&&actor.role!=="Editor")throw new PolicyImportError("access",403);

 const {form,bytes,name,type}=source;
 const raw=form.get("draft");
 if(typeof raw!=="string"||raw.length>250000||form.getAll("draft").length!==1)throw new PolicyImportError("input");
 let input:Record<string,unknown>;
 try{input=JSON.parse(raw);}catch{throw new PolicyImportError("input");}
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PolicyImportError("input");
 const requestId=String(input.requestId||""),target=String(input.policyId||"");
 if(!/^PIM-[0-9a-f-]{36}$/.test(requestId)||target.length>100||!["new","existing"].includes(String(input.mode))||(input.mode==="existing")!==!!target)throw new PolicyImportError("input");
 if(typeof input.content!=="string"||input.content.trim().length<80||input.content.length>policyImportTextLimit)throw new PolicyImportError("length");
 const policyId=target||"POL-"+crypto.randomUUID(),versionId="PV-"+crypto.randomUUID();
 let version:ReturnType<typeof validatePolicyVersion>,metadata:ReturnType<typeof validatePolicy>|null;
 try{version=validatePolicyVersion({...input,policyId});metadata=target?null:validatePolicy(input);}
 catch{throw new PolicyImportError("input");}
 const fileHash=await sha256HexBytes(bytes);
 const hashText=(s:string)=>sha256HexBytes(new TextEncoder().encode(s));
 const requestHash=await hashText(JSON.stringify([target,metadata,{...version,policyId:target},name,type,fileHash]));
 const db=env.DB;
 const replay=async()=>{
  const row=await db.prepare("SELECT policy_id,version_id,request_hash,imported_by FROM policy_import_sources WHERE request_id=?").bind(requestId).first<Row>();
  if(!row)return null;
  if(row.request_hash!==requestHash||row.imported_by!==actor.email)throw new PolicyImportError("conflict",409);
  return {policyId:String(row.policy_id),versionId:String(row.version_id),replay:true};
 };
 const previous=await replay();if(previous)return previous;
 const guard=draftReferences(versionId,version);
 if(guard.values.length)await ensureCoreGrcSchemaCompatibility(db);
 let claim:D1PreparedStatement,number=1,now=new Date().toISOString();
 if(metadata){
  const p=metadata;
  const selection=await prepareWorkflowSelection(env,actor,{...p,assignmentMode:"directory"},{owner:"writer",reviewer:"reviewer"},false,[actor.email]);
  claim=db.prepare(`INSERT INTO policy_documents(id,code,title,category,classification,owner,reviewer,audience,review_frequency_days,status,created_by,created_at,updated_by,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,'draft',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM policy_documents WHERE code=?) AND (${selection.guard.sql}) AND (${guard.sql})`)
   .bind(policyId,p.code,p.title,p.category,p.classification,p.owner,p.reviewer,p.audience,p.reviewFrequencyDays,actor.email,now,actor.email,now,p.code,...selection.guard.values,...guard.values);
 }else{
  const p=await db.prepare("SELECT * FROM policy_documents WHERE id=?").bind(policyId).first<Row>();
  if(!p||["retired","cancelled"].includes(String(p.status)))throw new PolicyImportError("conflict",409);
  const max=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS n FROM policy_versions WHERE policy_id=?").bind(policyId).first<{n:number}>();
  number=Number(max?.n||0)+1;now=nextLifecycleStamp(p.updated_at);
  claim=lifecycleClaim(db,"policy_documents","updated_by=?,updated_at=?",[actor.email,now],p,{sql:`NOT EXISTS(SELECT 1 FROM policy_versions WHERE policy_id=? AND status IN ('draft','review','approved')) AND COALESCE((SELECT MAX(version_number) FROM policy_versions WHERE policy_id=?),0)=? AND (${guard.sql})`,values:[policyId,policyId,number-1,...guard.values]});
 }
 const objectKey=env.BUCKET?"policy-imports/"+versionId+"/"+fileHash:"db:"+versionId;
 const contentHash=await hashText(version.content);
 const event=(action:string,detail:string)=>lifecycleInsert(db,"policy_events",{id:crypto.randomUUID(),policy_id:policyId,version_id:versionId,action,detail,actor:actor.email,created_at:now});
 const rows=[insertDraftVersion(db,version,versionId,number,contentHash,actor.email,now),
  lifecycleInsert(db,"policy_import_sources",{version_id:versionId,policy_id:policyId,request_id:requestId,request_hash:requestHash,imported_by:actor.email,file_name:name,file_type:type,file_size:bytes.length,file_sha256:fileHash,object_key:objectKey}),
  ...(metadata?[event("policy-create",metadata.code)]:[]),event("version-import",name+" · SHA-256 "+fileHash)];
 if(env.BUCKET){
  try{await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:type}});}catch{throw new PolicyImportError("store",503);}
 }else{
  for(let pos=0;pos<bytes.length;pos+=chunkSize){
   rows.push(db.prepare("INSERT INTO policy_import_chunks(version_id,part,content) SELECT ?,?,? WHERE changes()=1")
    .bind(versionId,pos/chunkSize,bytes.subarray(pos,pos+chunkSize)));
  }
 }
 try{await commitReferencedLifecycle(db,claim,rows,guard);}
 catch(error){
  // Each attempt owns a unique key. A lost DB response can follow a successful commit.
  const existing=await db.prepare("SELECT version_id FROM policy_import_sources WHERE version_id=?").bind(versionId).first();
  if(!existing&&env.BUCKET)await env.BUCKET.delete(objectKey);
  const recorded=await replay();if(recorded)return recorded;
  throw error;
 }
 return {policyId,versionId,replay:false};
}
export function importErrorResponse(error:unknown){
 const [code,status]=error instanceof PolicyImportError?[error.code,error.status]:error instanceof WorkflowSelectionError?[error.status===403?"access":"person",error.status]:error instanceof CoreReferenceUnavailable?["reference",409]:error instanceof LifecycleConflict?["conflict",409]:["unavailable",503];
 return Response.json({code},{status:Number(status),headers:{"cache-control":"no-store"}});
}
export async function downloadPolicyOriginal(env:Env,id:string){
 const row=await env.DB.prepare("SELECT s.file_name,s.file_type,s.file_size,s.object_key FROM policy_import_sources s JOIN policy_versions v ON v.id=s.version_id AND v.policy_id=s.policy_id WHERE s.version_id=?").bind(id).first<{file_name:string;file_type:string;file_size:number;object_key:string}>();
 if(!row)return new Response(null,{status:404});
 let body:BodyInit;
 if(row.object_key==="db:"+id){
  const data=new Uint8Array(row.file_size);
  for(let pos=0;pos<data.length;pos+=chunkSize){
   const part=await env.DB.prepare("SELECT content FROM policy_import_chunks WHERE version_id=? AND part=?").bind(id,pos/chunkSize).first<{content:ArrayBuffer|number[]}>();
   if(!part)return new Response(null,{status:503});
   const chunk=Array.isArray(part.content)?Uint8Array.from(part.content):new Uint8Array(part.content);
   if(chunk.length!==Math.min(chunkSize,data.length-pos))return new Response(null,{status:503});
   data.set(chunk,pos);
  }
  body=data;
 }else{
  const object=await env.BUCKET?.get(row.object_key);
  if(!object)return new Response(null,{status:503});
  body=object.body;
 }
 return new Response(body,{headers:{"content-type":row.file_type,"content-disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(row.file_name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16)),"cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'"}});
}
