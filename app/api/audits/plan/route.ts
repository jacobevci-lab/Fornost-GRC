import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {aiRecordQueryId} from '../../../ai/record-reads';
import {emptyAuditPlan,saveAuditPlan,validateAuditPlan} from '../../../audit-plan';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}});
export async function GET(req:NextRequest){
 const access=await requireRole(req,['Admin','Editor','Viewer']);if(access.response)return access.response;
 let id;try{id=aiRecordQueryId(req.nextUrl.searchParams);if(!id)throw new Error();}catch{return json({error:'Geçersiz denetim kimliği.'},400);}
 const{env}=await import('cloudflare:workers');
 if(!await env.DB.prepare('SELECT id FROM simple_audits WHERE id=?').bind(id).first())return json({error:'Denetim bulunamadı.'},404);
 const row=await env.DB.prepare('SELECT value FROM simple_grc_metadata WHERE key=?').bind(`audit_plan_${id}`).first<{value:string}>();
 return json(row?JSON.parse(row.value):{plan:emptyAuditPlan,revision:'',updatedAt:null,updatedBy:null});
}
export async function PUT(req:NextRequest){
 const access=await requireRole(req,['Admin','Editor']);if(access.response)return access.response;
 let id:string,revision:string,plan;try{const body=await req.json();if(typeof body.id!=='string'||!body.id||body.id.length>100||typeof body.expectedRevision!=='string'||body.expectedRevision.length>100)throw new Error();id=body.id;revision=body.expectedRevision;plan=validateAuditPlan(body.plan);}catch{return json({error:'Alanları ve tarih aralıklarını kontrol edin. Her tarih aralığının iki ucunu da girin.'},400);}
 try{const{env}=await import('cloudflare:workers');const saved=await saveAuditPlan(env.DB,id,revision,plan,access.actor.email);return saved?json(saved):json({error:'Denetim silinmiş veya plan başka bir kullanıcı tarafından değiştirilmiş. Taslağınızı koruyup güncel planı yeniden yükleyin.'},409);}catch{return json({error:'Plan kaydedilemedi. Taslağınız korunuyor.'},503);}
}
