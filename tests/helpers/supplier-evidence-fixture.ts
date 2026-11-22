import assert from 'node:assert/strict';
import {fixture} from './enterprise-route-fixture';
import {appendEvidenceVersion,sha256HexBytes} from '../../app/evidence/versioning';
import {ensureCoreGrcSchemaCompatibility} from '../../app/api/grc/schema-compat';
import {ensureWorkflowEvidenceSchema} from '../../app/workflow-selection-store';
import {TPRM_CONTROLS} from '../../app/third-party-risk/domain';
import type {Actor} from '../../app/api/auth/security';

export const actor=(id:string,role:'Admin'|'Editor'|'Viewer'='Admin'):Actor=>({id,email:id+'@example.com',name:id,role,source:'local'});
export const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const phrases:Record<string,string>={submit:'İNCELEMEYE GÖNDER',approve:'TEDARİKÇİYİ ONAYLA',conditional:'KOŞULLU ONAYLA',start:'BULGUYU BAŞLAT','submit-finding':'BULGUYU DOĞRULAMAYA GÖNDER','verify-finding':'BULGUYU KAPAT','reopen-finding':'BULGUYU YENİDEN AÇ',offboard:'TEDARİKÇİYİ KAPAT'};
export async function setup(){
 const f=fixture('third-party-risk');await f.post({});await ensureCoreGrcSchemaCompatibility(f.db);await ensureWorkflowEvidenceSchema(f.db);
 f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
 for(const [id,role] of [['maker','Admin'],['reviewer','Admin'],['owner','Editor'],['lead','Editor'],['viewer','Viewer']])f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(id,id,id+'@example.com',role,'Active');
 const bytes=new TextEncoder().encode('%PDF-1.4\nSupplier assurance report'),hash=await sha256HexBytes(bytes),evidenceId='EVD-tprm',key=`evidence/${evidenceId}/supplier.pdf`,stamp=new Date().toISOString();
 const version=await appendEvidenceVersion(f.db,{evidenceId,fileKey:key,fileName:'supplier.pdf',fileType:'application/pdf',fileSize:bytes.length,contentSha256:hash,evidenceTitle:'Supplier assurance',owner:'owner@example.com',period:'2026-Q4',frameworks:'ISO 27001',controlRefs:'A.5.19',changeNote:'Initial report',createdBy:'maker@example.com',createdAt:stamp},{additionalStatements:c=>[f.db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(evidenceId,'Kanıtlar',JSON.stringify({evidenceTitle:'Supplier assurance',versionNo:c.versionNo,versionChainSha256:c.chainSha256}),stamp,stamp)]});
 f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key,'supplier.pdf','application/pdf',bytes,stamp);
 const vendor={action:'save-vendor',assignmentMode:'directory',name:'Assurance supplier',service:'Payments hosting',legalEntity:'Supplier Ltd',category:'SaaS',criticality:'high',dataClassification:'confidential',dataAccess:'Payment metadata',hostingLocation:'EU',businessOwner:'lead@example.com',riskOwner:'owner@example.com',reviewer:'reviewer@example.com',contact:'contact@vendor.test',contractEnd:future(365),nextReview:future(30),exitPlan:'Export records, revoke access and obtain a deletion certificate.',impact:3,likelihood:2,controlMaturity:4,treatmentPlan:'Validate supplier controls and record independent evidence.',...Object.fromEntries(TPRM_CONTROLS.map(key=>[key,true]))};
 f.setActor(actor('maker'));const created=await f.post(vendor);assert.equal(created.status,201,JSON.stringify(created.body));
 const vendorId=String(created.body.vendorId),assessmentId=String(created.body.assessmentId),choice={evidenceMode:'library',evidenceSelection:{evidenceId,versionId:version.id}};
 const row=(table:string,id:string,keyName='id')=>f.sqlite.prepare(`SELECT * FROM ${table} WHERE ${keyName}=?`).get(id)!;
 const count=(table:string)=>Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
 const decision=(operation:string,id=assessmentId,patch:Record<string,unknown>={})=>{
  const kind=operation==='offboard'?'offboard':operation.includes('finding')||operation==='start'?'finding':'assessment',table=kind==='offboard'?'third_party_profiles':kind==='finding'?'third_party_findings':'third_party_assessments';
  return f.post({action:kind==='offboard'?'offboard':kind+'-action',[kind==='offboard'?'vendorId':kind==='finding'?'findingId':'assessmentId']:id,operation,note:'Independent supplier assurance and remediation evidence reviewed.',confirmation:phrases[operation],expectedRevision:row(table,id,kind==='offboard'?'vendor_id':'id').updated_at,...(!['start','reopen-finding'].includes(operation)?choice:{}),...patch});
 };
 const addFinding=async()=>{f.setActor(actor('maker'));const r=await f.post({action:'add-finding',assignmentMode:'directory',assessmentId,title:'Improve access reviews',severity:'medium',description:'Complete supplier privileged access remediation.',owner:'owner@example.com',dueDate:future(20)});assert.equal(r.status,201,JSON.stringify(r.body));return String(r.body.id)};
 return {...f,vendor,vendorId,assessmentId,evidenceId,key,hash,bytes,version,choice,row,count,decision,addFinding};
}

export async function prepareExit(f:Awaited<ReturnType<typeof setup>>){
 f.setActor(actor('owner','Editor'));const revision=()=>f.row('third_party_profiles',f.vendorId,'vendor_id').updated_at;
 assert.equal((await f.post({action:'start-exit',vendorId:f.vendorId,expectedRevision:revision()})).status,200);
 assert.equal((await f.post({action:'save-exit',vendorId:f.vendorId,expectedRevision:revision(),accessRevoked:true,dataReturned:true,...f.choice})).status,200);
 f.setActor(actor('reviewer'));
}
