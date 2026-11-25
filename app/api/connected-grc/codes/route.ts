import {contextTable} from '../../../connected-map-context-store';
import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '../../auth/security';
import {canReadModule,isScoped} from '../../../module-access';

export async function POST(req:NextRequest){
  const auth=await requireRole(req,['Admin','Editor','Viewer']);if(auth.response)return auth.response;
  const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'private, no-store'}});
  if(isScoped(auth.actor))return json({error:'forbidden'},403);
  try{
    const raw=await req.text();if(raw.length>100000)return json({error:'size'},413);
    const payload=JSON.parse(raw),ids:unknown=payload.keys,records:unknown=payload.ids;
    if(!Array.isArray(records)||records.length>400||records.some(x=>typeof x!=='string'||x.length>240))return json({error:'input'},400);
    if(!Array.isArray(ids)||ids.length>400||ids.some(id=>typeof id!=='string'||id.length>240||!id))return json({error:'input'},400);
    const {env}=await import('cloudflare:workers');
    const result=await env.DB.prepare(`WITH requested(id) AS (SELECT value FROM json_each(?))
      SELECT requested.id record_id,COALESCE(display.module,native.module) module,CASE WHEN display.code IS NOT NULL AND (
        native.code NOT GLOB substr(display.code,1,instr(display.code,'-'))||'[0-9][0-9][0-9]*'
        OR substr(native.code,instr(native.code,'-')+1) GLOB '*[^0-9]*') THEN display.code ELSE COALESCE(native.code,display.code) END code
      FROM requested LEFT JOIN simple_grc_record_codes native ON native.record_id=requested.id
      LEFT JOIN simple_grc_record_codes display ON display.record_id='map:display:'||requested.id
      WHERE COALESCE(display.code,native.code) IS NOT NULL`).bind(JSON.stringify(ids)).all<{record_id:string;module:string;code:string}>();
    await env.DB.prepare(contextTable).run();
    const graph=await env.DB.prepare('SELECT id,source_id,target_id,relation,target_module,source_module FROM connected_map_context_links WHERE source_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(records)).all<{id:string;source_id:string;target_id:string;relation:string;target_module:string;source_module:string}>();
    const edges=graph.results.filter(e=>auth.actor.role==='Admin'||![e.source_module,e.target_module].includes('AI Yönetişimi')).map(({id,source_id,target_id,relation})=>({id,source_id,target_id,relation}));
    return json({edges,codes:Object.fromEntries(result.results.filter(r=>canReadModule(auth.actor,r.module)&&(r.module!=='AI Yönetişimi'||auth.actor.role==='Admin')).map(r=>[r.record_id,r.code]))});
  }catch(error){return json({error:error instanceof SyntaxError?'input':'unavailable'},error instanceof SyntaxError?400:503)}
}
