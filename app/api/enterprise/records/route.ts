import {NextRequest} from 'next/server';
import {identityDb,requireRole} from '../../auth/security';
import {readBoundedJsonObject} from '../../request-body';
import {reply,failure,assertInput} from '../../../enterprise/http';
import {listRecords,updateRecord,recordKind,recordEntityLabels} from '../../../enterprise/register';
import {enterpriseProjection,financialExposure} from '../../../enterprise/projection';
import {createScopedRecord,intakePeople} from '../../../enterprise/intake';
import {canManage} from '../../../enterprise/scope';
export async function GET(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor','Viewer']);if(a.response)return a.response;
 try{const p=req.nextUrl.searchParams,offset=Number(p.get('offset')||0);assertInput(Number.isSafeInteger(offset)&&offset>=0);
 if(p.get('view')==='audit'){
  if(!canManage(a.actor))return reply({code:'scope'},403);
  const rows=(await (await identityDb()).prepare('SELECT id,actor,action,subject,stamp FROM org_access_events ORDER BY stamp DESC,id DESC LIMIT 101 OFFSET ?').bind(offset).all()).results;
  return reply({rows:rows.slice(0,100),more:rows.length>100});
 }
 if(p.get('view')==='overview')return reply(await enterpriseProjection(await identityDb(),a.actor));
 if(p.get('view')==='finance')return reply(await financialExposure(await identityDb(),a.actor));
 if(p.get('view')==='people')return reply(await intakePeople(await identityDb(),a.actor,recordKind(p.get('kind')),p.get('entity')||''));
 if(p.get('view')==='labels')return reply(await recordEntityLabels(await identityDb(),a.actor,recordKind(p.get('kind')),JSON.parse(p.get('ids')||'[]')));
 return reply(await listRecords(await identityDb(),a.actor,recordKind(p.get('kind')),offset,(p.get('id')||'').slice(0,240),(p.get('q')||'').slice(0,160)));}catch(e){return failure(e)}
}
export async function POST(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor']);if(a.response)return a.response;
 try{return reply(await createScopedRecord(await identityDb(),a.actor,await readBoundedJsonObject(req,24000)),201)}catch(e){return failure(e)}
}
export async function PATCH(req:NextRequest){
 const a=await requireRole(req,['Admin','Editor']);if(a.response)return a.response;
 try{await updateRecord(await identityDb(),a.actor,await readBoundedJsonObject(req,18000));return reply({ok:true});}catch(e){return failure(e)}
}
