import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {collectReportSources} from '../../../report-sources';

export async function GET(req:NextRequest){
 // The central guard also denies module-scoped and entity-restricted sessions.
 const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
 try{const {env}=await import('cloudflare:workers');return json(await collectReportSources(env.DB,auth.actor.role==='Admin'));}
 catch(error){return json({error:error instanceof Error&&error.message==='limit'?'limit':'unavailable',complete:false},503);}
}
