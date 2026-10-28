import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {ensureFindingsSchemaCompatibility} from '../schema-compat';
import {FindingHistoryError,readFindingHistory} from '../../../findings/history';
import {readFindingDecisionPins} from '../../../findings/decision-store';
export async function GET(req:NextRequest){
 const access=await requireRole(req,['Admin','Editor','Viewer']);if(access.response)return access.response;
 const {env}=await import('cloudflare:workers');const db=(env as unknown as {DB:D1Database}).DB;
 await ensureFindingsSchemaCompatibility(db);
 try {
  const findingId=req.nextUrl.searchParams.get('findingId')||'',history=await readFindingHistory(db,findingId,req.nextUrl.searchParams.get('after'),req.nextUrl.searchParams.get('stamp'));
  const evidencePins=await readFindingDecisionPins(db,findingId,history.events.map(e=>e.id));
  return NextResponse.json({...history,evidencePins},{headers:{'cache-control':'no-store'}});
 }
 catch(error){return NextResponse.json({error:error instanceof FindingHistoryError?error.message:'Finding history unavailable'},{status:error instanceof FindingHistoryError?error.status:503,headers:{'cache-control':'no-store'}});}
}
