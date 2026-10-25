import {milestoneHistoryForAccess} from '../../../evidence/change-followups';
import {syncMilestoneNotifications} from '../../../audit-milestone-notifications';
import {readAuditReminderProfile} from '../../../audit-reminder-store';
import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {canReadModule,canWriteModule} from '../../../module-access';
import {AuditRequestError} from '../../../audit-requests';
import {auditRequestId} from '../../../audit-request-store';
import {isAuditClosedError} from '../../../audit-closure';
import {readMilestones,milestonePeople,mutateMilestone,createMilestoneBatch} from '../../../audit-milestone-store';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
const fail=(err:unknown)=>isAuditClosedError(err)?json({error:'audit-closed'},409):err instanceof AuditRequestError?json({error:err.code},err.status):json({error:'unavailable'},503);
export async function GET(req:NextRequest){
 const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
 try{
  if(!canReadModule(auth.actor,'Denetim Yönetimi'))throw new AuditRequestError('forbidden',403);
  const auditId=auditRequestId(req.nextUrl.searchParams.get('auditId')),{env}=await import('cloudflare:workers');
  const evidenceAccess=canReadModule(auth.actor,'Kanıtlar');
  const state=await readMilestones(env.DB,auditId,evidenceAccess),canManage=canWriteModule(auth.actor,'Denetim Yönetimi');
  const people=canManage?await milestonePeople(env.DB):{people:[],peopleComplete:true};
  const id=req.nextUrl.searchParams.get('id');
  const history=id?await env.DB.prepare('SELECT id,actor,action,note,snapshot_json,created_at FROM audit_milestone_events WHERE audit_id=? AND milestone_id=? ORDER BY created_at DESC,rowid DESC LIMIT 101').bind(auditId,auditRequestId(id)).all():null;
  return json({...state,...people,reminderProfile:await readAuditReminderProfile(env.DB,auditId),actorEmail:auth.actor.email.toLowerCase(),admin:auth.actor.role==='Admin',canManage,history:history?.results.slice(0,100).map(event=>milestoneHistoryForAccess(event as {snapshot_json:string},evidenceAccess))||[],historyComplete:!history||history.results.length<=100});
 }catch(err){return fail(err);}
}
export async function POST(req:NextRequest){
 const auth=await requireRole(req,['Admin','Editor']);if(auth.response)return auth.response;
 try{const raw=await req.text();if(new TextEncoder().encode(raw).length>48000)return json({error:'fields'},413);let body;try{body=JSON.parse(raw);}catch{throw new AuditRequestError('fields');}if(!body||typeof body!=='object'||Array.isArray(body))throw new AuditRequestError('fields');const{env}=await import('cloudflare:workers');if(body.action==='create-batch')return json({ok:true,...await createMilestoneBatch(env.DB,auth.actor,body)});const result=await mutateMilestone(env.DB,auth.actor,body);let remindersPending=false;try{await syncMilestoneNotifications(env.DB,new Date(),body.auditId);}catch{remindersPending=true;}return json({ok:true,...result,remindersPending});}catch(err){return fail(err);}
}
