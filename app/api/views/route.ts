import { NextRequest,NextResponse } from 'next/server';
import { requireRole } from '../auth/security';
import { AccountViewError } from '../../account-views';
import { readAccountViews,mutateAccountView,readTeamViewHistory } from '../../account-view-store';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
const fail=(error:unknown)=>error instanceof AccountViewError?json({error:error.code},error.status):json({error:'unavailable'},503);
export async function GET(req:NextRequest) {
  const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
  try { const {env}=await import('cloudflare:workers'),q=req.nextUrl.searchParams;
    if ([...q.keys()].some(key=>!['module','scope','id','history','revision'].includes(key))) return json({error:'fields'},400);
    if(q.has('history')){
      if(q.get('history')!=='1'||!q.has('id'))return json({error:'fields'},400);
      return json(await readTeamViewHistory(env.DB,auth.actor,{module:q.get('module'),scope:q.get('scope'),id:q.get('id'),...(q.has('revision')?{revision:q.get('revision')}:{})}));
    }
    if(q.has('revision'))return json({error:'fields'},400);
    return json(await readAccountViews(env.DB,auth.actor,{module:q.get('module'),scope:q.get('scope'),...(q.has('id')?{id:q.get('id')}:{})}));
  } catch(error) { return fail(error); }
}
export async function POST(req:NextRequest) {
  const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
  try { const raw=await req.text();if(new TextEncoder().encode(raw).length>32768)return json({error:'fields'},413);
    let body;try{body=JSON.parse(raw);}catch{return json({error:'fields'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'fields'},400);
    const {env}=await import('cloudflare:workers');return json({ok:true,...await mutateAccountView(env.DB,auth.actor,body)});
  } catch(error) { return fail(error); }
}
