import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {AuditRequestError} from '../../../audit-requests';
import {isAuditClosedError} from '../../../audit-closure';
import {readEvidenceChangePreview,createEvidenceChangeFollowup} from '../../../evidence/change-followup-store';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'cache-control':'private, no-store'}});
const fail=(error:unknown)=>isAuditClosedError(error)?json({error:'audit-closed'},409):error instanceof AuditRequestError?json({error:error.code},error.status):json({error:'unavailable'},503);
export async function GET(req:NextRequest){
  const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
  try{const {env}=await import('cloudflare:workers');return json(await readEvidenceChangePreview(env.DB,auth.actor,req.nextUrl.searchParams.get('evidenceId')||'',req.nextUrl.searchParams.get('sourceKind'),req.nextUrl.searchParams.get('sourceId')||''));}catch(error){return fail(error);}
}
export async function POST(req:NextRequest){
  const auth=await requireRole(req,['Admin','Editor']);if(auth.response)return auth.response;
  try{const raw=await req.text();if(new TextEncoder().encode(raw).length>16000)return json({error:'fields'},413);let body;try{body=JSON.parse(raw);}catch{throw new AuditRequestError('fields');}if(!body||typeof body!=='object'||Array.isArray(body))throw new AuditRequestError('fields');const {env}=await import('cloudflare:workers');return json({ok:true,...await createEvidenceChangeFollowup(env.DB,auth.actor,body)});}catch(error){return fail(error);}
}
