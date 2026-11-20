import { NextRequest, NextResponse } from 'next/server';
import { readCatalogRequest } from '../../audit-catalog-import';
import { requireRole } from '../auth/security';
import { ensureCoreGrcSchemaCompatibility } from '../grc/schema-compat';
import { canReadModule, canReadPosture, canWriteModule } from '../../module-access';
import { programName } from '../../framework-posture/catalog';
import { baselineToken, ensurePosture, enroll, indexPrograms, makeBaseline, previewCatalog, programOverview, PostureError, readImpact, readMatrix, saveDecision } from '../../framework-posture/store';

const reply = (value:unknown,status=200) => NextResponse.json(value,{status,headers:{'cache-control':'private, no-store'}});
function failure(error:unknown) {
  return error instanceof PostureError ? reply({error:error.code},error.status) : reply({error:'unavailable'},503);
}
export async function GET(req:NextRequest) {
  const auth=await requireRole(req,['Admin','Editor','Viewer']);
  if(auth.response)return auth.response;
  if(!canReadPosture(auth.actor))return reply({error:'forbidden'},403);
  try {
    const {env:{DB:db}}=await import('cloudflare:workers');
    await ensureCoreGrcSchemaCompatibility(db);
    const query=req.nextUrl.searchParams;
    if(query.has('auditId')){
      if(!canReadModule(auth.actor,'Denetim Yönetimi'))return reply({error:'forbidden'},403);
      const result=await db.prepare("SELECT m.value FROM simple_grc_metadata m JOIN simple_audits a ON m.key='audit_posture_'||a.id WHERE a.id=?").bind(query.get('auditId')).first<{value:string}>();
      return reply({baseline:result?JSON.parse(result.value):null});
    }
    await ensurePosture(db);
    if(query.has('controlId'))return reply({impact:await readImpact(db,query.get('controlId')||'')});
    if(query.has('overview'))return reply(await programOverview(db));
    if(query.has('preview'))return reply(previewCatalog(query.get('name')||''));
    if(!query.has('name'))return reply(await indexPrograms(db));
    if(query.has('period') && !canReadModule(auth.actor,'Denetim Yönetimi'))return reply({error:'forbidden'},403);
    const matrix=await readMatrix(db,programName(query.get('name')||''));
    if(query.has('periods'))return reply({periods:[...new Set(Object.values(matrix.pins).flat().map(p=>p.period))].sort()});
    if(!query.has('period'))return reply(matrix);
    const baseline=makeBaseline(matrix,(query.get('period')||'').trim());
    return reply({baseline,token:await baselineToken(baseline)});
  } catch(error){return failure(error);}
}
export async function POST(req:NextRequest) {
  const auth=await requireRole(req,['Admin','Editor']);
  if(auth.response)return auth.response;
  if(!canReadPosture(auth.actor)||!canWriteModule(auth.actor,'Uyum'))return reply({error:'forbidden'},403);
  try {
    let parsed;
    try{parsed=await readCatalogRequest(req);}catch{return reply({error:'fields'},400);}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return reply({error:'fields'},400);
    const body=parsed as Record<string,unknown>;
    const {env:{DB:db}}=await import('cloudflare:workers');
    await ensurePosture(db);
    if(body.action==='save')await ensureCoreGrcSchemaCompatibility(db);
    if(body.action==='enroll')await enroll(db,String(body.name||''),auth.actor.email);
    else if(body.action==='save')await saveDecision(db,body,auth.actor.email);
    else return reply({error:'action'},400);
    return reply({ok:true});
  }catch(error){return failure(error);}
}
