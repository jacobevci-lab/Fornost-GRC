import { normalizeQuestions,type QuestionInput } from './questionnaire-import';
import { ensureCoreGrcSchemaCompatibility } from '../../api/grc/schema-compat';
import { sha256HexBytes,ensureEvidenceHistorySchema,verifyEvidenceVersionChainWithAnchor,type EvidenceVersionRow } from '../../evidence/versioning';
import { evaluateEvidenceEligibility } from '../../evidence/eligibility';
import { evidenceReviewerIsIndependent } from '../../evidence/intake';
import { recordDataClassificationAllowed } from '../data-policy';
import { analyzeWithRouter,digest,privacyRow,type Runtime } from './router';
import { extractDocument,storedBytes } from './documents';
import { applyQuestionnaireModelDrafts,mergeVendorExtraction,reviewEvidence,analyzeVendor,draftAnswer,type Lang,type Source } from './domain';
import { ensureGrcAi } from './schema';
type RecordRow={id:string;code:string;module:string;data_json:string;updated_at:string};
export async function prepareStore(env:Runtime){await ensureCoreGrcSchemaCompatibility(env.DB);await ensureEvidenceHistorySchema(env.DB);await ensureGrcAi(env.DB);}
export async function coreRecord(db:D1Database,id:string,module:string){const row=await db.prepare('SELECT r.*,COALESCE(c.code,r.id) code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.id=? AND r.module=?').bind(id,module).first<RecordRow>();if(!row)throw new Error('AI_NOT_FOUND');return row;}
async function source(row:RecordRow,kind:Source['kind']):Promise<Source>{const data=JSON.parse(row.data_json);return {id:row.id,code:row.code,kind,text:JSON.stringify(data).slice(0,6000),...(kind==='control'?{implemented:data.status==='Aktif'&&data.implementation==='Uygulanıyor'}:{}),hash:await digest(row.data_json+row.updated_at),classification:recordDataClassificationAllowed(data,'Internal')?'Internal':recordDataClassificationAllowed(data,'Confidential')?'Confidential':'Restricted'};}
export async function controlSources(db:D1Database,refs?:string[]){
 const rows=await db.prepare(`SELECT r.*,COALESCE(c.code,r.id) code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Kontroller' AND (?=0 OR r.id IN(SELECT value FROM json_each(?)) OR c.code IN(SELECT value FROM json_each(?))) ORDER BY r.id LIMIT 501`).bind(refs?1:0,JSON.stringify(refs||[]),JSON.stringify(refs||[])).all<RecordRow>();
 if(rows.results.length>500)throw new Error('AI_CATALOG_LIMIT');return Promise.all(rows.results.filter(r=>refs||JSON.parse(r.data_json).status==='Aktif').map(r=>source(r,'control')));
}
export async function evidenceContext(env:Runtime,id:string){
 const row=await coreRecord(env.DB,id,'Kanıtlar'),data=JSON.parse(row.data_json);
 const versions=(await env.DB.prepare('SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no').bind(id).all<EvidenceVersionRow>()).results;
 if((await verifyEvidenceVersionChainWithAnchor(versions,{versionNo:data.versionNo,chainSha256:data.versionChainSha256})).state!=='verified')throw new Error('AI_FILE_INTEGRITY');
 const version=versions.at(-1)!;const controls=await controlSources(env.DB,String(data.controlRefs||data.controlRef||'').split(/[,;|\n]+/).map(s=>s.trim()).filter(Boolean));
 return {row,data,version,controls,hash:await digest(row.data_json+row.updated_at+JSON.stringify(controls))};
}
export async function sourceCatalog(env:Runtime):Promise<Source[]>{
 const config=await privacyRow(env.DB),mode=config?JSON.parse(config.config).mode:'offline';
 const max=mode==='byok'?'Internal':'Confidential';
 const controls=(await controlSources(env.DB)).filter(s=>s.classification!=='Restricted'&&(max==='Confidential'||s.classification!=='Confidential'));
 const policies=await env.DB.prepare("SELECT p.id,p.code,p.title,p.classification,p.updated_at,v.id version,v.content,v.content_sha256,v.updated_at version_updated FROM policy_documents p JOIN policy_versions v ON v.id=p.current_version_id WHERE p.status='published' AND v.status='published' AND v.approved_by IS NOT NULL AND v.approved_by<>v.created_by AND v.effective_date<=date('now') AND (p.next_review IS NULL OR p.next_review>=date('now')) ORDER BY p.id LIMIT 501").all<{id:string;code:string;title:string;classification:string;updated_at:string;version:string;content:string;content_sha256:string;version_updated:string}>();
 if(policies.results.length>500)throw new Error('AI_CATALOG_LIMIT');
 const sources:Source[]=[...controls.filter(s=>/^CTL-\d{3,}$/.test(s.code))];for(const p of policies.results)if(/^POL-\d{3,}$/.test(p.code)&&recordDataClassificationAllowed(p,max)&&await digest(p.content)===p.content_sha256)sources.push({id:p.id,code:p.code,kind:'policy',text:p.title+'\n'+p.content.slice(0,6000),hash:await digest(JSON.stringify(p)),classification:recordDataClassificationAllowed(p,'Internal')?'Internal':'Confidential'});
 const evidence=(await env.DB.prepare("SELECT id FROM simple_grc_records WHERE module='Kanıtlar' AND json_extract(data_json,'$.reviewStatus')='approved' ORDER BY updated_at DESC LIMIT 101").all<{id:string}>()).results;
 if(evidence.length>100)throw new Error('AI_CATALOG_LIMIT');
 for(const {id} of evidence){try{const {row,data,version}=await evidenceContext(env,id);if(!recordDataClassificationAllowed(data,max)||!evaluateEvidenceEligibility(data).current||!evidenceReviewerIsIndependent(data)||data.reviewedVersion!==version.id||String(data.reviewedBy).toLowerCase()!==String(data.reviewer).toLowerCase())continue;if(!/^EVD-\d{3,}$/.test(row.code))continue;const bytes=await storedBytes(env,version.file_key,version.content_sha256),doc=await extractDocument(bytes,version.file_name,version.file_type);const s=await source(row,'evidence');s.text=String(data.evidenceTitle||'')+'\n'+doc.text.slice(0,5800);s.controlRefs=String(data.controlRefs||data.controlRef||'').split(/[,;|\n]+/).map(x=>x.trim()).filter(Boolean);s.supportsImplementation=!!doc.text&&!doc.ocr&&!/\b(?:disabled|report[ -]?only|not enforced|not implemented|not enabled|exception|deviation)\b|devre d[ıi][şs][ıi]|uygulanm[ıi]yor|istisna/i.test(doc.text);sources.push(s);}catch{/* Unverifiable evidence never enters the retrieval set. */}}
 return sources;
}
async function saveResult<T>(env:Runtime,kind:string,subject:string,sourceHash:string,result:T,actor:string){const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO grc_ai_results VALUES(?,?,?,?,?,?,?)').bind(id,kind,subject,sourceHash,JSON.stringify(result),actor,new Date().toISOString()).run();return {id,kind,subject,sourceHash,result};}
export async function reviewStoredEvidence(env:Runtime,id:string,actor:string,lang:Lang,transcript?:{text:string;hash:string}){
 const context=await evidenceContext(env,id),{version,data,controls}=context;
 const bytes=await storedBytes(env,version.file_key,version.content_sha256);
 const doc=await extractDocument(bytes,version.file_name,version.file_type);
 if(transcript){if(!doc.ocr||transcript.hash!==version.content_sha256||transcript.text.length>160000)throw new Error('AI_TRANSCRIPT');doc.text=transcript.text;}
 const result={...reviewEvidence(doc.text,controls,lang,doc.ocr),version:version.version_no,fileHash:version.content_sha256,ocrRequired:doc.ocr&&!doc.text,modelNotes:null as string|null};
 const classification=recordDataClassificationAllowed(data,'Internal')&&controls.every(c=>c.classification==='Internal')?'Internal':recordDataClassificationAllowed(data,'Confidential')&&controls.every(c=>c.classification!=='Restricted')?'Confidential':'Restricted';
 if(classification==='Restricted')throw new Error('AI_CLASSIFICATION');
 result.modelNotes=await analyzeWithRouter(env,actor,'evidence-review',{lang,text:doc.text,controls,result},classification);
 if((await evidenceContext(env,id)).hash!==context.hash)throw new Error('AI_STALE');
 return saveResult(env,'evidence',id,context.hash,result,actor);
}
export async function analyzeVendorFile(env:Runtime,vendorId:string,actor:string,lang:Lang,bytes:Uint8Array,name:string,type:string,transcript?:string,documentSource?:{id:string;code:string;hash:string;classification:string}){
 const vendor=await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(vendorId).first<Record<string,unknown>>();if(!vendor)throw new Error('AI_NOT_FOUND');
 const row=await coreRecord(env.DB,vendorId,'Tedarikçiler'),data=JSON.parse(row.data_json);
 let classification=recordDataClassificationAllowed({...data,dataClassification:vendor.data_classification||data.dataClassification||'Internal'},'Internal')?'Internal':recordDataClassificationAllowed({...data,dataClassification:vendor.data_classification||data.dataClassification||'Internal'},'Confidential')?'Confidential':'Restricted';
 if(documentSource&&(documentSource.classification==='Restricted'||documentSource.classification==='Confidential'&&classification==='Internal'))classification=documentSource.classification;
 if(classification==='Restricted')throw new Error('AI_CLASSIFICATION');
 const doc=await extractDocument(bytes,name,type);if(doc.ocr&&transcript&&transcript.length<=160000)doc.text=transcript;
 if(doc.text.length<40)throw new Error('AI_NO_TEXT');
 const fileHash=await sha256HexBytes(bytes);
 const sourceHash=await digest(JSON.stringify(vendor)+row.data_json+row.updated_at);
 const extracted=analyzeVendor(doc.text);
 const model=await analyzeWithRouter(env,actor,'vendor-analysis',{lang,instruction:'Return JSON {opinion: qualified|unqualified|unknown, opinionQuotes:string[], period:string[], subprocessors:string[], items:[{kind:exception|cuec,quote:string}]}. Each quote must be a verbatim excerpt of this document. Do not invent any field; use empty arrays for missing information.',document:doc.text,extracted},classification);
 const result={...(model?mergeVendorExtraction(extracted,model,doc.text):extracted),documentSource:documentSource||null,fileHash,fileName:name.slice(0,200),ocr:doc.ocr,sourceHash,modelNotes:null};
 const freshVendor=await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(vendorId).first(),freshRow=await coreRecord(env.DB,vendorId,'Tedarikçiler');
 if(sourceHash!==await digest(JSON.stringify(freshVendor)+freshRow.data_json+freshRow.updated_at))throw new Error('AI_STALE');
 if(documentSource&&(await vendorDocumentContext(env,vendorId,documentSource.id)).hash!==documentSource.hash)throw new Error('AI_STALE');
 return saveResult(env,'vendor',vendorId,sourceHash,result,actor);
}
export async function createQuestionnaire(env:Runtime,actor:string,title:string,questions:(string|QuestionInput)[],lang:Lang){
 const normalized=normalizeQuestions(questions);
 const sources=await sourceCatalog(env);const answers=normalized.map(q=>({...draftAnswer(q.question,sources,lang),code:q.code,category:q.category}));
 // One bounded call; citations must quote the selected, canonical source text exactly.
 const notes=await analyzeWithRouter(env,actor,'questionnaire',{lang,instruction:'Return JSON {answers:[{index,status:yes|partial|no,answer,quotes:[{id,quote}]}]}. Answer only from the sources provided for each question. Do not claim unverified certification or effectiveness.',questions:answers.map((a,index)=>({index,question:a.question,sources:a.sources.map(s=>({id:s.id,text:s.text.slice(0,Math.min(1200,Math.floor(100000/answers.length/4)))}))}))},sources.some(s=>s.classification==='Confidential')?'Confidential':'Internal');
 if(notes)applyQuestionnaireModelDrafts(answers,notes);
 const id=crypto.randomUUID(),revision=crypto.randomUUID();await env.DB.prepare('INSERT INTO grc_ai_questionnaires VALUES(?,?,?,?,?,?)').bind(id,title.slice(0,200)||'RFP',JSON.stringify(answers),revision,actor,new Date().toISOString()).run();return {id,revision};
}

function vendorRefs(data:Record<string,unknown>){return Array.isArray(data.vendorEvidenceRefs)?data.vendorEvidenceRefs.filter((x):x is string=>typeof x==='string'):String(data.vendorEvidenceRefs||'').split(/[,;|\n]+/).map(x=>x.trim()).filter(Boolean);}
export async function vendorDocumentContext(env:Runtime,vendorId:string,evidenceId:string){
 const vendor=await coreRecord(env.DB,vendorId,'Tedarikçiler'),context=await evidenceContext(env,evidenceId),refs=vendorRefs(JSON.parse(vendor.data_json));
 if(context.data.sourceVendorRef!==vendorId&&!refs.some(ref=>ref===context.row.id||ref===context.row.code))throw new Error('AI_VENDOR_DOCUMENT');
 if(!/^EVD-\d{3,}$/.test(context.row.code))throw new Error('AI_FILE_INTEGRITY');
 return {...context,classification:recordDataClassificationAllowed(context.data,'Internal')?'Internal':recordDataClassificationAllowed(context.data,'Confidential')?'Confidential':'Restricted'};
}
export async function vendorEvidenceChoices(env:Runtime,vendorId:string){
 const vendor=await coreRecord(env.DB,vendorId,'Tedarikçiler'),refs=JSON.stringify(vendorRefs(JSON.parse(vendor.data_json)));
 const rows=(await env.DB.prepare("SELECT r.id,c.code,r.data_json FROM simple_grc_records r JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module='Kanıtlar' AND (json_extract(r.data_json,'$.sourceVendorRef')=? OR r.id IN(SELECT value FROM json_each(?)) OR c.code IN(SELECT value FROM json_each(?))) ORDER BY r.updated_at DESC LIMIT 101").bind(vendorId,refs,refs).all<{id:string;code:string;data_json:string}>()).results;
 return {items:rows.slice(0,100).filter(r=>/^EVD-\d{3,}$/.test(r.code)&&recordDataClassificationAllowed(JSON.parse(r.data_json),'Confidential')).map(r=>{const d=JSON.parse(r.data_json);return {id:r.id,code:r.code,title:String(d.evidenceTitle||r.code),fileName:String(d.fileName||''),reviewStatus:String(d.reviewStatus||'unknown')};}),limited:rows.length>100};
}
export async function analyzeStoredVendorDocument(env:Runtime,vendorId:string,evidenceId:string,actor:string,lang:Lang){
 const c=await vendorDocumentContext(env,vendorId,evidenceId),bytes=await storedBytes(env,c.version.file_key,c.version.content_sha256);
 return analyzeVendorFile(env,vendorId,actor,lang,bytes,c.version.file_name,c.version.file_type,undefined,{id:evidenceId,code:c.row.code,hash:c.hash,classification:c.classification});
}
export async function vendorAnalysisCurrent(env:Runtime,analysis:{subject:string;source_hash:string;result:string}){
 const vendor=await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(analysis.subject).first(),core=await coreRecord(env.DB,analysis.subject,'Tedarikçiler');
 if(analysis.source_hash!==await digest(JSON.stringify(vendor)+core.data_json+core.updated_at))return false;
 const result=JSON.parse(analysis.result);if(result.documentSource){try{if((await vendorDocumentContext(env,analysis.subject,result.documentSource.id)).hash!==result.documentSource.hash)return false;}catch{return false;}}return true;
}
