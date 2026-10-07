import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {ensureFindingsSchemaCompatibility} from '../schema-compat';
import {FindingHistoryError,readFindingHistory} from '../../../findings/history';
export async function GET(req:NextRequest){
 const access=await requireRole(req,['Admin','Editor','Viewer']);if(access.response)return access.response;
 const {env}=await import('cloudflare:workers');const db=(env as unknown as {DB:D1Database}).DB;
 await ensureFindingsSchemaCompatibility(db);
 try {return NextResponse.json(await readFindingHistory(db,req.nextUrl.searchParams.get('findingId')||'',req.nextUrl.searchParams.get('after'),req.nextUrl.searchParams.get('stamp')),{headers:{'cache-control':'no-store'}});}
 catch(error){if(error instanceof FindingHistoryError)return NextResponse.json({error:error.message},{status:error.status,headers:{'cache-control':'no-store'}});throw error;}
}
