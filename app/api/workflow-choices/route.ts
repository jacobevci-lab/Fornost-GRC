import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../auth/security';
import {workflowPeople,workflowEvidenceChoices,WorkflowSelectionError} from '../../workflow-selection-store';
export async function GET(req:NextRequest) {
  // This route is deliberately outside the scoped-module allowlist, like continuity and regulatory workflows.
  const access=await requireRole(req,['Admin','Editor']);if(access.response)return access.response;
  const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
  const {env}=await import('cloudflare:workers');const db=(env as unknown as {DB:D1Database}).DB;
  const q=(req.nextUrl.searchParams.get('q')||'').trim().slice(0,160),kind=req.nextUrl.searchParams.get('kind');
  try {
    if(kind==='people')return reply(await workflowPeople(db,q,req.nextUrl.searchParams.get('reviewer')==='true'));
    if(kind==='evidence') {
      const page=Number(req.nextUrl.searchParams.get('page')||0);
      if(!Number.isInteger(page)||page<0||page>10000)return reply({error:'Invalid page'},400);
      return reply(await workflowEvidenceChoices(db,q,page,(req.nextUrl.searchParams.get('evidenceId')||'').slice(0,110)));
    }
    return reply({error:'Invalid choice type'},400);
  }catch(error){if(error instanceof WorkflowSelectionError)return reply({error:error.message,code:error.code},error.status);throw error;}
}
