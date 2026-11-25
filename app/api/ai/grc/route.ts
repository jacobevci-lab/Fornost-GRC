import { NextRequest,NextResponse } from 'next/server';
import { requireRole } from '../../auth/security';
import { isScoped } from '../../../module-access';
import { canManage } from '../../../enterprise/scope';
import { aiRuntime,recordAiEvent } from '../../../ai/storage';
import { defaultPrivacy,privacyRow,savePrivacy,type PrivacyConfig,type Runtime } from '../../../ai/grc/router';
import { prepareStore,evidenceContext,reviewStoredEvidence,analyzeVendorFile,sourceCatalog,createQuestionnaire,vendorEvidenceChoices,analyzeStoredVendorDocument,vendorAnalysisCurrent } from '../../../ai/grc/store';
import { sourcesCurrent,draftAnswer,csv,canClaimMet,type Answer,type Lang } from '../../../ai/grc/domain';
import { convertVendorItem } from '../../../ai/grc/conversion';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'private, no-store'}});
async function access(req:NextRequest,write=false){const a=await requireRole(req,write?['Admin','Editor']:['Admin','Editor','Viewer']);if(a.response)return a;if(isScoped(a.actor)||a.actor.orgScope?.restricted)return {...a,response:json({code:'AI_SCOPE'},403)};return a;}
const fail=(e:unknown)=>{const known=e&&typeof e==='object'&&'code' in e?String(e.code):'';const code=e instanceof Error&&/^AI_[A-Z_]+$/.test(e.message)?e.message:['ASSIGNEE_SELECTION','SELECTION_ACCESS','AI_SCOPE','AI_OPERATION_BLOCKED'].includes(known)?known:'AI_FAILED';return json({code},code==='AI_NOT_FOUND'?404:code==='AI_STALE'?409:['AI_SCOPE','AI_OPERATION_BLOCKED','SELECTION_ACCESS'].includes(code)?403:422);};
export async function GET(req:NextRequest){
 const a=await access(req);if(a.response)return a.response;
 try{const env=await aiRuntime() as Runtime;await prepareStore(env);const kind=req.nextUrl.searchParams.get('kind'),id=req.nextUrl.searchParams.get('id');
 if(kind==='config'){if(!canManage(a.actor))return json({code:'AI_ADMIN'},403);const row=await privacyRow(env.DB);return json({...row?JSON.parse(row.config):defaultPrivacy,configured:!!row,revision:row?.revision||'',hasSecret:!!row?.secret});}
 if(kind==='vendor-documents'){if(!id)throw new Error('AI_NOT_FOUND');return json(await vendorEvidenceChoices(env,id));}
 if(kind==='evidence'||kind==='vendor'){
  if(!id)throw new Error('AI_NOT_FOUND');
  const row=await env.DB.prepare('SELECT * FROM grc_ai_results WHERE kind=? AND subject=? ORDER BY created_at DESC LIMIT 1').bind(kind,id).first<{id:string;result:string;source_hash:string;subject:string}>();
  if(kind==='evidence'){const context=await evidenceContext(env,id);const notes=(await env.DB.prepare("SELECT id,result,actor,created_at FROM grc_ai_results WHERE kind='evidence-note' AND subject=? ORDER BY created_at DESC LIMIT 10").bind(id).all<{id:string;result:string;actor:string;created_at:string}>()).results.map(n=>({...n,result:JSON.parse(n.result),stale:JSON.parse(n.result).evidenceRevision!==context.row.updated_at}));return json({analysis:row?{...row,result:JSON.parse(row.result),stale:row.source_hash!==context.hash}:null,notes});}
  const conversions=row?(await env.DB.prepare("SELECT v.item,v.target,v.record_id id,c.code FROM grc_ai_conversions v JOIN simple_grc_record_codes c ON c.record_id=CASE v.target WHEN 'finding' THEN 'work:finding:'||v.record_id ELSE v.record_id END WHERE v.result_id=?").bind(row.id).all()).results:[];
  return json({analysis:row?{...row,result:JSON.parse(row.result),stale:!await vendorAnalysisCurrent(env,row),conversions}:null});
 }
 if(kind==='questionnaires')return json({items:(await env.DB.prepare('SELECT id,title,revision,actor,created_at FROM grc_ai_questionnaires ORDER BY created_at DESC LIMIT 100').all()).results});
 if(kind==='questionnaire'||kind==='export'){
  const row=await env.DB.prepare('SELECT * FROM grc_ai_questionnaires WHERE id=?').bind(id).first<{id:string;title:string;answers:string;revision:string}>();if(!row)throw new Error('AI_NOT_FOUND');
  const answers:Answer[]=JSON.parse(row.answers),sources=await sourceCatalog(env);const states=answers.map(answer=>({...answer,stale:!sourcesCurrent(answer,sources)}));
  if(kind==='questionnaire')return json({...row,answers:states});
  if(req.nextUrl.searchParams.get('revision')!==row.revision||states.some(x=>!x.approvedBy||x.stale||x.status==='yes'&&!canClaimMet(x)))throw new Error('AI_STALE');
  const tr=req.nextUrl.searchParams.get('lang')==='tr';const rows=[tr?['Soru Kodu','Kategori','Soru','Durum','Kurumsal Yanıt','Güven','Kaynaklar','İnceleyen','İnceleme Tarihi']:['Question Code','Category','Question','Status','Answer','Confidence','Sources','Reviewed by','Reviewed at'],...answers.map((x,i)=>[x.code||`Q-${String(i+1).padStart(3,'0')}`,x.category||'',x.question,x.status==='yes'?(tr?'Karşılanıyor':'Met'):x.status==='partial'?(tr?'Kısmen Karşılanıyor':'Partially met'):(tr?'Karşılanmıyor / Yol Haritasında':'Not met / Roadmap'),x.answer,x.confidence,x.sources.map(s=>s.code).join('; '),x.approvedBy||'',x.approvedAt||''])];
  await recordAiEvent(env.DB,{actor:a.actor.email,action:'questionnaire-export',status:'success',contextRefs:[row.id],detail:row.revision});
  if(req.nextUrl.searchParams.get('format')==='xlsx'){const {default:write}=await import('write-excel-file/node');const buffer=await write(rows.map(r=>r.map(value=>({value:String(value),type:String})))).toBuffer();return new NextResponse(new Uint8Array(buffer),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="fornost-rfp.xlsx"','cache-control':'no-store'}});}
  return new NextResponse(csv(rows),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="fornost-rfp.csv"','cache-control':'no-store'}});
 }
 throw new Error('AI_NOT_FOUND');
 }catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 const a=await access(req,true);if(a.response)return a.response;
 try{const env=await aiRuntime() as Runtime;await prepareStore(env);
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(req.headers.get('content-length')||0)>11*1024*1024)throw new Error('AI_FILE_SIZE');
  const fd=await req.formData(),file=fd.get('file');if(!(file instanceof File)||file.size>10485760)throw new Error('AI_FILE_SIZE');
  return json(await analyzeVendorFile(env,String(fd.get('vendorId')||''),a.actor.email,fd.get('lang')==='en'?'en':'tr',new Uint8Array(await file.arrayBuffer()),file.name,file.type,String(fd.get('transcript')||'')));
 }
 const raw=await req.text();if(raw.length>500000)throw new Error('AI_TEXT_LIMIT');const b=JSON.parse(raw),lang:Lang=b.lang==='en'?'en':'tr';
 if(b.action==='config'){if(!canManage(a.actor))return json({code:'AI_ADMIN'},403);return json(await savePrivacy(env,b as PrivacyConfig,a.actor.email));}
 if(b.action==='test'){if(!canManage(a.actor))return json({code:'AI_ADMIN'},403);const {LLMGateway}=await import('../../../ai/llm-gateway');const result=await new LLMGateway(env).analyze(a.actor.email,'connection-test',{instruction:'Reply OK',lang});return json({ok:!result.fallback,...result});}
 if(b.action==='evidence')return json(await reviewStoredEvidence(env,String(b.id),a.actor.email,lang,b.transcript));
 if(b.action==='vendor-document')return json(await analyzeStoredVendorDocument(env,String(b.vendorId),String(b.evidenceId),a.actor.email,lang));
 if(b.action==='convert')return json(await convertVendorItem(env,a.actor,b));
 if(b.action==='create-questionnaire')return json(await createQuestionnaire(env,a.actor.email,String(b.title||''),b.questions,lang));
 if(['answer','approve','delete-questionnaire','refresh-questionnaire'].includes(b.action)){
  const row=await env.DB.prepare('SELECT * FROM grc_ai_questionnaires WHERE id=?').bind(b.id).first<{answers:string;revision:string;title:string}>();if(!row)throw new Error('AI_NOT_FOUND');if(row.revision!==b.revision)throw new Error('AI_STALE');
  const answers:Answer[]=JSON.parse(row.answers);let update:D1Result;
  if(b.action==='delete-questionnaire')update=await env.DB.prepare('DELETE FROM grc_ai_questionnaires WHERE id=? AND revision=?').bind(b.id,b.revision).run();
  else{
   if(b.action==='refresh-questionnaire'){const sources=await sourceCatalog(env);answers.splice(0,answers.length,...answers.map(x=>({...draftAnswer(x.question,sources,lang),code:x.code,category:x.category})));}
   else{const answer=answers[b.index];if(!answer)throw new Error('AI_QUESTIONS');
    if(b.action==='answer'){if(typeof b.answer!=='string'||!b.answer.trim()||b.answer.length>8000||!['yes','partial','no'].includes(b.status))throw new Error('AI_QUESTIONS');if(b.status==='yes'&&(!canClaimMet(answer)||!sourcesCurrent(answer,await sourceCatalog(env))))throw new Error('AI_UNSUPPORTED_ANSWER');answer.answer=b.answer;answer.status=b.status;delete answer.approvedBy;delete answer.approvedAt;}
    else {if(!sourcesCurrent(answer,await sourceCatalog(env)))throw new Error('AI_STALE');if(answer.status==='yes'&&!canClaimMet(answer))throw new Error('AI_UNSUPPORTED_ANSWER');answer.approvedBy=a.actor.email;answer.approvedAt=new Date().toISOString();}
   }
   update=await env.DB.prepare('UPDATE grc_ai_questionnaires SET answers=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(answers),crypto.randomUUID(),b.id,b.revision).run();
  }
  if(!update.meta?.changes)throw new Error('AI_STALE');await recordAiEvent(env.DB,{actor:a.actor.email,action:'rfp:'+b.action,status:'success',contextRefs:[b.id],detail:`row ${b.index??''}; human action`});return json({ok:true});
 }
 throw new Error('AI_ACTION');
 }catch(e){return fail(e);}
}
