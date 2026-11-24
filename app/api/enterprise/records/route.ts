import {NextRequest} from 'next/server';
import {identityDb,requireRole} from '../../auth/security';
import {readBoundedJsonObject} from '../../request-body';
import {reply,failure,assertInput} from '../../../enterprise/http';
import {listRecords,updateRecord,recordKind} from '../../../enterprise/register';
export async function GET(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor','Viewer']);if(a.response)return a.response;
 try{const p=req.nextUrl.searchParams,offset=Number(p.get('offset')||0);assertInput(Number.isSafeInteger(offset)&&offset>=0);
 return reply(await listRecords(await identityDb(),a.actor,recordKind(p.get('kind')),offset));}catch(e){return failure(e)}
}
export async function PATCH(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor']);if(a.response)return a.response;
 try{await updateRecord(await identityDb(),a.actor,await readBoundedJsonObject(req,18000));return reply({ok:true});}catch(e){return failure(e)}
}
