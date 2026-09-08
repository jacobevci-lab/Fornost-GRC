import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { chunkKnowledgeContent, normalizeKnowledgeContent, validateKnowledgeGovernance, validateKnowledgeInput, KNOWLEDGE_TYPES, type KnowledgeType } from "@/app/ai/knowledge";
import { sha256 } from "@/app/ai/governance";
import { cleanAiText } from "@/app/ai/security";
import { aiRuntime, recordAiEvent } from "@/app/ai/storage";

const json = (data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"cache-control":"no-store"}});
type SourceRow={id:string;name:string;source_type:string;classification:string;status:string;current_version:number;content_hash:string;character_count:number;chunk_count:number;created_by:string;created_at:string;updated_by:string;updated_at:string;approved_by:string|null;approved_at:string|null;decision_note:string|null;owner:string|null;review_due_at:string|null};

const publicSource=(row:SourceRow)=>({id:row.id,name:row.name,sourceType:row.source_type,classification:row.classification,status:row.status,currentVersion:Number(row.current_version),contentHash:row.content_hash,characterCount:Number(row.character_count),chunkCount:Number(row.chunk_count),createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at,approvedBy:row.approved_by,approvedAt:row.approved_at,decisionNote:row.decision_note,owner:row.owner||row.updated_by,reviewDueAt:row.review_due_at});
const sourceSelect="SELECT s.*,g.owner,g.review_due_at FROM ai_knowledge_sources s LEFT JOIN ai_knowledge_governance g ON g.source_id=s.id";
const defaultReviewDueAt=()=>new Date(Date.now()+180*86_400_000).toISOString().slice(0,10);

async function bindChunkHashes(db:D1Database,sourceId:string,version:number,chunks:string[],now:string){
  const statements=[];
  for(let ordinal=0;ordinal<chunks.length;ordinal++)statements.push(db.prepare("INSERT INTO ai_knowledge_chunks(id,source_id,version,ordinal,content_text,content_hash,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),sourceId,version,ordinal,chunks[ordinal],await sha256(chunks[ordinal]),now));
  return statements;
}

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin","Editor","Viewer"]);if(access.response)return access.response;
  const {DB}=await aiRuntime();
  const id=cleanAiText(req.nextUrl.searchParams.get("id"),80);
  if(id){
    if(access.actor.role!=="Admin")return json({error:"Kaynak içeriğini yalnız Admin görüntüleyebilir."},403);
    const source=await DB.prepare(`${sourceSelect} WHERE s.id=?`).bind(id).first<SourceRow>();
    if(!source)return json({error:"Bilgi kaynağı bulunamadı."},404);
    const versions=await DB.prepare("SELECT id,version,content_hash,character_count,chunk_count,created_by,created_at FROM ai_knowledge_versions WHERE source_id=? ORDER BY version DESC LIMIT 50").bind(id).all<Record<string,unknown>>();
    const current=await DB.prepare("SELECT normalized_content FROM ai_knowledge_versions WHERE source_id=? AND version=?").bind(id,source.current_version).first<{normalized_content:string}>();
    return json({source:publicSource(source),content:current?.normalized_content||"",versions:(versions.results||[]).map(row=>({id:row.id,version:Number(row.version),contentHash:row.content_hash,characterCount:Number(row.character_count),chunkCount:Number(row.chunk_count),createdBy:row.created_by,createdAt:row.created_at}))});
  }
  const result=await DB.prepare(`${sourceSelect} ORDER BY s.updated_at DESC LIMIT 200`).all<SourceRow>();
  return json({sources:(result.results||[]).map(publicSource),retrievalPolicy:{approvedOnly:true,restrictedExcluded:true,maxChunks:16,maxCharacters:9000}});
}

export async function POST(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>200_000)return json({error:"Bilgi kaynağı isteği çok büyük."},413);
  const body=await req.json().catch(()=>({}));
  try{
    const value=validateKnowledgeInput(body),governance=validateKnowledgeGovernance(body,access.actor.email),chunks=chunkKnowledgeContent(value.content),contentHash=await sha256(value.content),id=crypto.randomUUID(),now=new Date().toISOString(),env=await aiRuntime();
    const duplicate=await env.DB.prepare("SELECT id,name,status FROM ai_knowledge_sources WHERE content_hash=? LIMIT 1").bind(contentHash).first<{id:string;name:string;status:string}>();
    if(duplicate){
      await recordAiEvent(env.DB,{actor:access.actor.email,action:"knowledge-duplicate-blocked",contextRefs:[duplicate.id],status:"denied",detail:`Duplicate content blocked; existing source ${duplicate.name} (${duplicate.status})`});
      return json({error:`Aynı içerik “${duplicate.name}” kaynağında zaten bulunuyor.`,duplicate:{id:duplicate.id,name:duplicate.name,status:duplicate.status}},409);
    }
    const statements=[
      env.DB.prepare(`INSERT INTO ai_knowledge_sources(id,name,source_type,classification,status,current_version,content_hash,character_count,chunk_count,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,'draft',1,?,?,?,?,?,?,?)`).bind(id,value.name,value.sourceType,value.classification,contentHash,value.content.length,chunks.length,access.actor.email,now,access.actor.email,now),
      env.DB.prepare("INSERT INTO ai_knowledge_governance(source_id,owner,review_due_at,updated_by,updated_at) VALUES(?,?,?,?,?)").bind(id,governance.owner,governance.reviewDueAt,access.actor.email,now),
      env.DB.prepare("INSERT INTO ai_knowledge_versions(id,source_id,version,content_hash,normalized_content,character_count,chunk_count,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,1,contentHash,value.content,value.content.length,chunks.length,access.actor.email,now),
      ...await bindChunkHashes(env.DB,id,1,chunks,now),
    ];
    await env.DB.batch(statements);
    await recordAiEvent(env.DB,{actor:access.actor.email,action:"knowledge-create",contextRefs:[id],status:"success",detail:`${value.name} v1 created as draft with ${chunks.length} bounded chunks`});
    return json({source:{id,name:value.name,sourceType:value.sourceType,classification:value.classification,status:"draft",currentVersion:1,contentHash,characterCount:value.content.length,chunkCount:chunks.length,createdBy:access.actor.email,createdAt:now,updatedBy:access.actor.email,updatedAt:now,approvedBy:null,approvedAt:null,decisionNote:null,owner:governance.owner,reviewDueAt:governance.reviewDueAt}},201);
  }catch(error){return json({error:error instanceof Error?error.message:"Bilgi kaynağı oluşturulamadı."},400);}
}

export async function PUT(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>200_000)return json({error:"Bilgi kaynağı isteği çok büyük."},413);
  const body=await req.json().catch(()=>({})),id=cleanAiText(body.id,80);
  if(!id||body.confirmation!=="YENİ SÜRÜM")return json({error:"Yeni sürüm için YENİ SÜRÜM yazın."},400);
  const env=await aiRuntime(),existing=await env.DB.prepare(`${sourceSelect} WHERE s.id=?`).bind(id).first<SourceRow>();
  if(!existing)return json({error:"Bilgi kaynağı bulunamadı."},404);
  if(existing.status==="archived")return json({error:"Arşivlenmiş kaynak için yeni sürüm oluşturulamaz."},409);
  const sourceType=cleanAiText(body.sourceType||existing.source_type,20) as KnowledgeType;
  if(!KNOWLEDGE_TYPES.includes(sourceType))return json({error:"Desteklenmeyen bilgi kaynağı türü."},400);
  try{
    const content=normalizeKnowledgeContent(body.content,sourceType),governance=validateKnowledgeGovernance({owner:body.owner||existing.owner||existing.updated_by,reviewDueAt:body.reviewDueAt||existing.review_due_at||defaultReviewDueAt()}),chunks=chunkKnowledgeContent(content),contentHash=await sha256(content);
    if(contentHash===existing.content_hash)return json({error:"Yeni içerik mevcut sürümle aynı."},409);
    const version=Number(existing.current_version)+1,now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE ai_knowledge_sources SET source_type=?,status='draft',current_version=?,content_hash=?,character_count=?,chunk_count=?,updated_by=?,updated_at=?,approved_by=NULL,approved_at=NULL,decision_note=NULL WHERE id=?").bind(sourceType,version,contentHash,content.length,chunks.length,access.actor.email,now,id),
      env.DB.prepare("INSERT INTO ai_knowledge_versions(id,source_id,version,content_hash,normalized_content,character_count,chunk_count,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,version,contentHash,content,content.length,chunks.length,access.actor.email,now),
      env.DB.prepare("INSERT INTO ai_knowledge_governance(source_id,owner,review_due_at,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET owner=excluded.owner,review_due_at=excluded.review_due_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(id,governance.owner,governance.reviewDueAt,access.actor.email,now),
      ...await bindChunkHashes(env.DB,id,version,chunks,now),
    ]);
    await recordAiEvent(env.DB,{actor:access.actor.email,action:"knowledge-version",contextRefs:[id],status:"success",detail:`${existing.name} v${version} created; approval reset to draft`});
    return json({ok:true,version,status:"draft"});
  }catch(error){return json({error:error instanceof Error?error.message:"Yeni sürüm oluşturulamadı."},400);}
}

export async function PATCH(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>64_000)return json({error:"Bilgi kaynağı karar isteği çok büyük."},413);
  const body=await req.json().catch(()=>({})),decision=cleanAiText(body.decision,20),note=cleanAiText(body.note,800);
  const requestedIds=(Array.isArray(body.ids)?body.ids:[body.id]).map(value=>cleanAiText(value,80)).filter(Boolean);
  const ids=[...new Set(requestedIds)],bulk=ids.length>1;
  if(ids.length>50)return json({error:"Tek işlemde en fazla 50 bilgi kaynağı seçilebilir."},400);
  if(!ids.length||!["approved","archived","reviewed"].includes(decision))return json({error:"Geçersiz bilgi kaynağı kararı."},400);
  const confirmation=decision==="reviewed"?"GÖZDEN GEÇİR":bulk?(decision==="approved"?"TOPLU ONAYLA":"TOPLU ARŞİVLE"):(decision==="approved"?"ONAYLA":"ARŞİVLE");
  if(body.confirmation!==confirmation||note.length<5)return json({error:`En az 5 karakter not girin ve ${confirmation} yazın.`},400);
  const env=await aiRuntime(),placeholders=ids.map(()=>"?").join(","),found=await env.DB.prepare(`${sourceSelect} WHERE s.id IN (${placeholders})`).bind(...ids).all<SourceRow>(),sources=found.results||[];
  if(sources.length!==ids.length)return json({error:"Seçilen bilgi kaynaklarından biri bulunamadı."},404);
  if(decision==="approved"&&sources.some(source=>source.status!=="draft"))return json({error:"Yalnız taslak kaynaklar onaylanabilir."},409);
  if(decision==="reviewed"&&sources.some(source=>source.status!=="approved"))return json({error:"Yalnız onaylı kaynaklar gözden geçirilebilir."},409);
  if(sources.some(source=>source.status==="archived"))return json({error:"Arşivlenmiş kaynak değiştirilemez."},409);
  const now=new Date().toISOString();
  let governance:{owner:string;reviewDueAt:string}|null=null;
  try{governance=decision==="reviewed"?validateKnowledgeGovernance(body,access.actor.email):null;}
  catch(error){return json({error:error instanceof Error?error.message:"Bilgi kaynağı yönetişimi geçersiz."},400);}
  const statements=sources.flatMap(source=>{
    const nextStatus=decision==="reviewed"?"approved":decision,approved=nextStatus==="approved";
    const rows=[env.DB.prepare("UPDATE ai_knowledge_sources SET status=?,updated_by=?,updated_at=?,approved_by=?,approved_at=?,decision_note=? WHERE id=?").bind(nextStatus,access.actor.email,now,approved?access.actor.email:null,approved?now:null,note,source.id)];
    if(approved){
      const owner=governance?.owner||source.owner||source.updated_by,reviewDueAt=governance?.reviewDueAt||source.review_due_at||defaultReviewDueAt();
      rows.push(env.DB.prepare("INSERT INTO ai_knowledge_governance(source_id,owner,review_due_at,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET owner=excluded.owner,review_due_at=excluded.review_due_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(source.id,owner,reviewDueAt,access.actor.email,now));
    }
    return rows;
  });
  await env.DB.batch(statements);
  const action=bulk?`knowledge-bulk-${decision}`:`knowledge-${decision}`;
  await recordAiEvent(env.DB,{actor:access.actor.email,action,contextRefs:ids,status:"success",detail:`${sources.length} source(s), decision ${decision}: ${note}`});
  return json({ok:true,status:decision==="reviewed"?"approved":decision,updated:sources.length});
}

export async function DELETE(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const body=await req.json().catch(()=>({})),id=cleanAiText(body.id,80);
  if(!id||body.confirmation!=="SİL")return json({error:"Silmek için SİL yazın."},400);
  const env=await aiRuntime(),existing=await env.DB.prepare("SELECT * FROM ai_knowledge_sources WHERE id=?").bind(id).first<SourceRow>();
  if(!existing)return json({error:"Bilgi kaynağı bulunamadı."},404);
  if(existing.status==="approved")return json({error:"Onaylı kaynak önce arşivlenmeli."},409);
  await env.DB.batch([env.DB.prepare("DELETE FROM ai_knowledge_chunks WHERE source_id=?").bind(id),env.DB.prepare("DELETE FROM ai_knowledge_versions WHERE source_id=?").bind(id),env.DB.prepare("DELETE FROM ai_knowledge_governance WHERE source_id=?").bind(id),env.DB.prepare("DELETE FROM ai_knowledge_sources WHERE id=?").bind(id)]);
  await recordAiEvent(env.DB,{actor:access.actor.email,action:"knowledge-delete",contextRefs:[id],status:"success",detail:`${existing.name} and all versions deleted after explicit confirmation`});
  return json({ok:true});
}
