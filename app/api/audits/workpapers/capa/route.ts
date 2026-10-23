import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../../../auth/security';
import { AuditRequestError } from '../../../../audit-requests';
import { isAuditClosedError } from '../../../../audit-closure';
import { createWorkpaperCapa, readWorkpaperCapa, readWorkpaperCapaOrigin } from '../../../../workpaper-capa-store';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'private, no-store'}});
const error=(e:unknown)=>isAuditClosedError(e)?json({error:'audit-closed'},409):e instanceof AuditRequestError?json({error:e.code},e.status):json({error:'unavailable'},503);
export async function GET(req:NextRequest){
 const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
 try{
  const {env}=await import('cloudflare:workers');
  const findingId=req.nextUrl.searchParams.get('findingId');
  return json(findingId?await readWorkpaperCapaOrigin(env.DB,auth.actor,findingId):await readWorkpaperCapa(env.DB,auth.actor,req.nextUrl.searchParams.get('auditId')||'',req.nextUrl.searchParams.get('workpaperId')||''));
 }catch(e){return error(e);}
}
export async function POST(req:NextRequest){
 const auth=await requireRole(req,['Admin','Editor']);if(auth.response)return auth.response;
 try{
  const text=await req.text();if(new TextEncoder().encode(text).length>32_768)return json({error:'fields'},413);
  let input;try{input=JSON.parse(text);}catch{throw new AuditRequestError('fields');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AuditRequestError('fields');
  const {env}=await import('cloudflare:workers');const result=await createWorkpaperCapa(env.DB,auth.actor,input);
  return json({ok:true,...result},result.reused?200:201);
 }catch(e){return error(e);}
}
