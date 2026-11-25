import type {NextRequest} from 'next/server';
import {identityDb,requireRole} from '../../auth/security';
import {readBoundedJsonObject} from '../../request-body';
import {directory,writeDirectory} from '../../../enterprise/directory';
import {reply,failure} from '../../../enterprise/http';
import {canManage} from '../../../enterprise/scope';
export async function GET(req:NextRequest){
 const a=await requireRole(req,['Admin']);if(a.response)return a.response;
 if(!canManage(a.actor))return reply({code:'scope'},403);
 try{return reply(await directory(await identityDb()));}catch(e){return failure(e)}
}
export async function POST(req:NextRequest){
 const a=await requireRole(req,['Admin']);if(a.response)return a.response;
 if(!canManage(a.actor))return reply({code:'scope'},403);
 try{return reply(await writeDirectory(await identityDb(),a.actor.email,await readBoundedJsonObject(req,48000)));}catch(e){return failure(e)}
}
