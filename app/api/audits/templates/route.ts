import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {AuditRequestError} from '../../../audit-requests';
import {sharedTemplateKind} from '../../../audit-shared-templates';
import {listSharedTemplates,readSharedTemplate,mutateSharedTemplate} from '../../../audit-shared-template-store';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
const fail=(err:unknown)=>err instanceof AuditRequestError?json({error:err.code},err.status):json({error:'unavailable'},503);
export async function GET(req:NextRequest){
 const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
 try{const {env}=await import('cloudflare:workers'),q=req.nextUrl.searchParams,id=q.get('id');
  if(id)return json(await readSharedTemplate(env.DB,auth.actor,id,q.get('revision')||undefined));
  let kind;try{kind=sharedTemplateKind(q.get('kind'));}catch{return json({error:'fields'},400);}
  if(q.has('archived')&&!['0','1'].includes(q.get('archived')!))return json({error:'fields'},400);
  return json(await listSharedTemplates(env.DB,auth.actor,kind,q.get('archived')==='1'));
 }catch(err){return fail(err);}
}
export async function POST(req:NextRequest){
 const auth=await requireRole(req,['Admin']);if(auth.response)return auth.response;
 try{const raw=await req.text();if(new TextEncoder().encode(raw).length>120000)return json({error:'fields'},413);let body;try{body=JSON.parse(raw);}catch{return json({error:'fields'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'fields'},400);const {env}=await import('cloudflare:workers');return json({ok:true,...await mutateSharedTemplate(env.DB,auth.actor,body)});}catch(err){return fail(err);}
}
