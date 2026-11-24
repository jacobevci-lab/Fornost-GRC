import {evidenceReviewerIsIndependent} from '../evidence/intake';
import { approvedAuditEvidence, inAuditPeriod } from '../audit-engagement';
import { completedInitialization } from '../completed-initialization';
import { evaluateEvidenceEligibility } from '../evidence/eligibility';
import { ensureEvidenceHistorySchema, verifyEvidenceVersionChainWithAnchor, splitEvidenceControlRefs, normalizeEvidenceControlRef, type EvidenceVersionRow } from '../evidence/versioning';
import { catalogFor, frameworkNames, programName } from './catalog';
import { implementationIndex, requirementState } from './requirements';
import type { Baseline, Control, Mapping, Matrix, OpenItem, ProgramCoverage, Pin, Requirement } from './types';

export class PostureError extends Error {
  constructor(public code:string, public status = 400) { super(code); }
}
const ready=completedInitialization();
export async function ensurePosture(db:D1Database) {
  await ready(db,()=>db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS framework_programs(name TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS framework_decisions(program TEXT NOT NULL,ref TEXT NOT NULL, applicability TEXT NOT NULL,reason TEXT NOT NULL,links TEXT NOT NULL,revision TEXT NOT NULL, actor TEXT NOT NULL,updated_at TEXT NOT NULL, PRIMARY KEY(program,ref))')
  ]));
}
export async function indexPrograms(db:D1Database) {
  return {catalog:frameworkNames,enrolled:(await db.prepare('SELECT name FROM framework_programs ORDER BY created_at,name').all<{name:string}>()).results.map(x=>x.name)};
}
export async function enroll(db:D1Database, name:string, actor:string) {
  if (!frameworkNames.includes(name)) throw new PostureError('framework');
  await db.prepare('INSERT OR IGNORE INTO framework_programs VALUES(?,?,?)').bind(name,actor,new Date().toISOString()).run();
}
type Core = {id:string; code:string|null; data_json:string};
type Saved = {ref:string; applicability:Requirement['applicability']; reason:string; links:string; revision:string};
const key = normalizeEvidenceControlRef;
const str = (x:unknown) => typeof x === 'string' ? x.trim() : '';
async function readSources(db:D1Database,name?:string){
  const coreSql = 'SELECT r.id,c.code,r.data_json FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id WHERE r.module=? ORDER BY r.id';
  const [controlsRead,legacy,decisions] = await db.batch([
    db.prepare(coreSql).bind('Kontroller'),db.prepare(coreSql).bind('Uyum'),name ? db.prepare('SELECT * FROM framework_decisions WHERE program=?').bind(name) : db.prepare('SELECT * FROM framework_decisions')
  ]);
  return {controls:controlsRead.results as Core[],legacy:legacy.results as Core[],decisions:decisions.results as (Saved&{program:string})[]};
}
function project(inputs:Awaited<ReturnType<typeof readSources>>,name:string){
  const controls:Control[] = [], aliases = new Map<string,Set<string>>(), legacyLinks=new Map<string,Set<string>>();
  const add = (ref:string,id:string) => {const set=legacyLinks.get(key(ref))??new Set<string>();set.add(id);legacyLinks.set(key(ref),set);};
  for (const r of inputs.controls) {
    const data=JSON.parse(r.data_json), code=r.code||str(data.controlRef)||r.id;
    controls.push({id:r.id,code,owner:str(data.ownerEmail)||str(data.owner),title:str(data.controlTitle)||str(data.title)||code,implementation:str(data.implementation)||str(data.status)});
    for (const value of [r.id,r.code,str(data.controlRef)]) if(value){const alias=key(value),ids=aliases.get(alias)??new Set<string>();ids.add(r.id);aliases.set(alias,ids);}
    const standards=[...new Set(splitEvidenceControlRefs(data.frameworks||data.framework).map(programName))];
    if(standards.length===1 && standards[0]===name && str(data.standardRef)) add(data.standardRef,r.id);
  }
  for(const r of inputs.legacy){
    const d=JSON.parse(r.data_json);
    if(programName(str(d.framework))!==name)continue;
    const ref=str(d.requirementRef)||str(d.controlRef), ids=aliases.get(key(d.controlLink));
    if(ref && ids?.size===1)add(ref,[...ids][0]);
  }
  const saved=new Map(inputs.decisions.filter(d=>d.program===name).map(d=>[d.ref,d]));
  const requirements=catalogFor(name).map(r=>{
    const decision=saved.get(r.ref);
    return {...r, applicability:decision?.applicability??(r.annex?'undecided':'required'),reason:decision?.reason??'',revision:decision?.revision??'',
      links:decision?JSON.parse(decision.links) as Mapping[]:[...(legacyLinks.get(key(r.ref))??[])].map(id=>({id,coverage:'supports' as const}))};
  });
  const liveIds=new Set(controls.map(c=>c.id));
  for(const r of requirements) r.links=r.links.filter(l=>liveIds.has(l.id));
  return {aliases,controls,requirements};
}
export async function readMatrix(db:D1Database,name:string):Promise<Matrix> {
  if (!frameworkNames.includes(name)) throw new PostureError('framework');
  if (!await db.prepare('SELECT 1 FROM framework_programs WHERE name=?').bind(name).first()) throw new PostureError('not-enrolled',404);
  const {aliases,controls,requirements}=project(await readSources(db,name),name);
  const pins=await readPins(db,aliases,new Set(requirements.flatMap(r=>r.links.map(l=>l.id))));
  return {name,requirements,controls,pins};
}

export function previewCatalog(name:string):Matrix {
  if (!frameworkNames.includes(name)) throw new PostureError('framework');
  return {name,controls:[],pins:{},requirements:catalogFor(name).map(r=>({
    ...r,applicability:r.annex?'undecided':'required',reason:'',revision:'',links:[]
  }))};
}

export async function programOverview(db:D1Database) {
  const index=await indexPrograms(db);
  if(!index.enrolled.length)return {...index,coverage:{},comparison:{},controlFrameworkCounts:{}};
  const sources=await readSources(db);
  const programs=index.enrolled.map(name=>({name,...project(sources,name)}));
  const mapped=new Set(programs.flatMap(p=>p.requirements.flatMap(r=>r.links.map(l=>l.id))));
  // Shared controls use the same verified evidence across all enrolled frameworks.
  const pins=await readPins(db,programs[0].aliases,mapped);
  const implementation=implementationIndex(programs[0].controls);
  const coverage:Record<string,ProgramCoverage>={};
  const controlFrameworkCounts:Record<string,number>=Object.create(null);
  const codes=new Map(programs[0].controls.map(control=>[control.id,control.code]));
  const comparison=Object.fromEntries(programs.map(program=>{
    const items:OpenItem[]=[];
    const linkedInScope=new Set<string>();
    let scope=0,compliant=0,evidenced=0,assessed=0;
    for(const row of program.requirements){
      const state=requirementState(row,pins,implementation);
      if(state==='excluded')continue;
      scope++;
      if(row.links.some(link=>implementation.get(link.id)))assessed++;
      if(row.links.some(link=>pins[link.id]?.length))evidenced++;
      for(const link of row.links)linkedInScope.add(link.id);
      if(state==='covered')compliant++;
      else if(items.length<3)items.push({ref:row.ref,title:row.title,state,controlCode:codes.get(row.links[0]?.id)});
    }
    for(const id of linkedInScope)controlFrameworkCounts[id]=(controlFrameworkCounts[id]??0)+1;
    coverage[program.name]={scope,compliant,evidenced,assessed};
    return [program.name,{openCount:scope-compliant,items}];
  }));
  return {...index,coverage,comparison,controlFrameworkCounts};
}

async function readPins(db:D1Database,aliases:Map<string,Set<string>>,mapped:Set<string>) {
  const pins:Record<string,Pin[]> = Object.create(null);
  if(mapped.size){
    await ensureEvidenceHistorySchema(db);
    const eligibleRefs=[...aliases].filter(([,ids])=>ids.size===1 && mapped.has([...ids][0])).map(([alias])=>alias);
    const versions=await db.prepare(`SELECT v.*,r.data_json,(SELECT code FROM simple_grc_record_codes WHERE record_id=r.id) AS code FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar'
      WHERE v.evidence_id IN (SELECT ec.evidence_id FROM evidence_version_controls ec WHERE ec.normalized_ref IN (SELECT value FROM json_each(?)))
      ORDER BY v.evidence_id,v.version_no`).bind(JSON.stringify(eligibleRefs)).all<EvidenceVersionRow & {data_json:string;code:string|null}>();
    const groups=new Map<string,typeof versions.results>();
    for(const v of versions.results){const group=groups.get(v.evidence_id)??[];group.push(v);groups.set(v.evidence_id,group);}
    for(const group of groups.values()){
      const v=group[group.length-1], data=JSON.parse(v.data_json);
      if(data.reviewStatus!=='approved' || data.reviewedVersion!==v.id || typeof data.reviewedBy!=='string' ||
        !evidenceReviewerIsIndependent(data,{email:data.reviewedBy},[group[0].created_by,v.created_by]) ||
        !evaluateEvidenceEligibility(data).current || !approvedAuditEvidence(data.status) ||
        v.content_sha256!==data.contentSha256 || v.period!==str(data.period) || !v.period)continue;
      if((await verifyEvidenceVersionChainWithAnchor(group,{versionNo:data.versionNo,chainSha256:data.versionChainSha256})).state!=='verified')continue;
      const currentRefs=new Set(splitEvidenceControlRefs(data.controlRefs||data.controlRef).map(key));
      const ids=new Set<string>();
      for(const ref of splitEvidenceControlRefs(v.control_refs)){
        const idsForRef=aliases.get(key(ref));
        if(currentRefs.has(key(ref)) && idsForRef?.size===1)ids.add([...idsForRef][0]);
      }
      for(const id of ids)if(mapped.has(id))(pins[id]??=[]).push({id:v.id,evidenceId:v.evidence_id,fileKey:v.file_key,code:v.code||'',collectedAt:str(data.collectedAt),title:v.evidence_title,version:v.version_no,hash:v.content_sha256,period:v.period});
    }
  }
  return pins;
}

export async function saveDecision(db:D1Database, body:Record<string,unknown>, actor:string) {
  const program=str(body.name),ref=str(body.ref),item=catalogFor(program).find(r=>r.ref===ref),app=str(body.applicability),reason=str(body.reason);
  if(!item || !Array.isArray(body.links) || body.links.length>250 || typeof body.revision!=='string' || reason.length>2000 ||
     !['included','excluded',item.annex?'undecided':'required'].includes(app) ||
     (app==='excluded'&&!reason))throw new PostureError('decision');
  const links:Mapping[]=[];
  for(const link of body.links){
    if(!link || !str(link.id) || !['partial','supports'].includes(link.coverage) || links.some(l=>l.id===link.id))throw new PostureError('mapping');
    links.push({id:link.id,coverage:link.coverage});
  }
  const revision=crypto.randomUUID(),ids=JSON.stringify(links.map(l=>l.id));
  const result=await db.prepare(`INSERT INTO framework_decisions(program,ref,applicability,reason,links,revision,actor,updated_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM framework_programs WHERE name=?)
      AND (SELECT COUNT(*) FROM simple_grc_records WHERE module='Kontroller' AND id IN (SELECT value FROM json_each(?)))=?
      AND COALESCE((SELECT revision FROM framework_decisions WHERE program=? AND ref=?),'')=?
    ON CONFLICT(program,ref) DO UPDATE SET applicability=excluded.applicability,reason=excluded.reason,links=excluded.links,
      revision=excluded.revision,actor=excluded.actor,updated_at=excluded.updated_at RETURNING revision`)
    .bind(program,ref,app,reason,JSON.stringify(links),revision,actor,new Date().toISOString(),program,ids,links.length,program,ref,body.revision).first();
  if(!result)throw new PostureError('conflict',409);
}

export function makeBaseline(matrix:Matrix, period:string):Baseline {
  if(!period.trim() || period.length>120)throw new PostureError('period');
  const controls=new Map(matrix.controls.map(c=>[c.id,c])), evidence:Record<string,Pin>=Object.create(null);
  const entries=matrix.requirements.map(r=>({
    ref:r.ref,title:r.title,applicability:r.applicability,reason:r.reason,
    controls:(r.applicability==='excluded'?[]:r.links).flatMap(link=>{
      const c=controls.get(link.id);if(!c)return [];
      const pins=(matrix.pins[c.id]??[]).filter(p=>inAuditPeriod(p.period,p.collectedAt||'',period) && r.applicability!=='excluded');
      for(const p of pins)evidence[p.id]=p;
      return [{...c,coverage:link.coverage,evidence:pins.map(p=>p.id)}];
    })
  }));
  return {framework:matrix.name,period,total:matrix.requirements.length,excluded:entries.filter(r=>r.applicability==='excluded').length,
    withEvidence:entries.filter(r=>r.controls.some(c=>c.evidence.length)).length,entries,evidence};
}
export async function baselineToken(b:Baseline) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(b)));
  return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}

export async function evidenceControlStandards(db:D1Database,refs?:string[]){
  await ensurePosture(db);
  const {enrolled}=await indexPrograms(db);
  const inputs=await readSources(db),byControl:Record<string,string[]>={};
  const selected=refs?new Set(refs.map(key)):null;
  for(const control of inputs.controls){
    if(selected&&![control.id,control.code].some(ref=>ref&&selected.has(key(ref))))continue;
    const data=JSON.parse(control.data_json);
    byControl[control.id]=splitEvidenceControlRefs(data.frameworks||data.framework).map(programName);
  }
  for(const name of enrolled){
    const ids=new Set(project(inputs,name).requirements.flatMap(r=>r.links.map(link=>link.id)));
    for(const id of ids)if(Object.hasOwn(byControl,id)&&!byControl[id].includes(name))byControl[id].push(name);
  }
  return {enrolled,byControl};
}
export async function mergeEvidenceStandards(db:D1Database,data:Record<string,unknown>){
  const refs=splitEvidenceControlRefs(data.controlRefs||data.controlRef).filter(ref=>/^CTL-/i.test(ref));
  if(!refs.length)return;
  const {byControl}=await evidenceControlStandards(db,refs);
  data.frameworks=[...new Set([...splitEvidenceControlRefs(data.frameworks),...Object.values(byControl).flat()])].join("; ");
}

export async function controlCatalog(db:D1Database,id:string){
  const {enrolled}=await indexPrograms(db);
  if(!enrolled.length)return {programs:[]};
  const inputs=await readSources(db);
  return {programs:enrolled.map(name=>({name,clauses:project(inputs,name).requirements.map(r=>({
    ref:r.ref,title:r.title,revision:r.revision,linked:r.links.some(link=>link.id===id)
  }))}))};
}

// The source control and all affected requirement decisions use one guarded D1 batch.
export async function prepareControlMappings(db:D1Database,id:string,raw:unknown,actor:string){
  if(!Array.isArray(raw)||!raw.length||raw.length>1000)throw new PostureError('mapping');
  await ensurePosture(db);
  const {enrolled}=await indexPrograms(db),inputs=await readSources(db);
  const matrices=new Map<string,Map<string,Requirement>>(),seen=new Set<string>();
  const decisions=raw.map(change=>{
    if(!change||typeof change.ref!=='string'||typeof change.linked!=='boolean'||typeof change.revision!=='string'||!enrolled.includes(change.name))throw new PostureError('mapping');
    const name=change.name as string,ref=change.ref as string,token=JSON.stringify([name,ref]);
    if(seen.has(token))throw new PostureError('mapping');
    seen.add(token);
    if(!matrices.has(name))matrices.set(name,new Map(project(inputs,name).requirements.map(row=>[row.ref,row])));
    const row=matrices.get(name)!.get(ref);
    if(!row)throw new PostureError('mapping');
    if(row.revision!==change.revision)throw new PostureError('conflict',409);
    const links=row.links.filter(link=>link.id!==id);
    if(change.linked)links.push(row.links.find(link=>link.id===id)??{id,coverage:'supports'});
    if(links.length>250)throw new PostureError('mapping');
    return {name,ref,previous:row.revision,next:crypto.randomUUID(),app:row.applicability,reason:row.reason,links};
  });
  const json=JSON.stringify(decisions);
  const guard={sql:`NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM framework_programs WHERE name=j.value->>'$.name')
    OR coalesce((SELECT revision FROM framework_decisions WHERE program=j.value->>'$.name' AND ref=j.value->>'$.ref'),'')<>j.value->>'$.previous')`,values:[json]};
  const after=db.prepare(`INSERT INTO framework_decisions(program,ref,applicability,reason,links,revision,actor,updated_at)
    SELECT value->>'$.name',value->>'$.ref',value->>'$.app',value->>'$.reason',value->'$.links',value->>'$.next',?,?
    FROM json_each(?) WHERE changes()=1
    ON CONFLICT(program,ref) DO UPDATE SET links=excluded.links,revision=excluded.revision,actor=excluded.actor,updated_at=excluded.updated_at`)
    .bind(actor,new Date().toISOString(),json);
  return {guard,after};
}

export async function readImpact(db:D1Database,id:string) {
  const {enrolled}=await indexPrograms(db);
  const impact:{framework:string;ref:string;title:string;coverage:Mapping["coverage"];applicability:Requirement["applicability"]}[]=[];
  if(!enrolled.length)return impact;
  const inputs=await readSources(db);
  for(const name of enrolled){
    const matrix=project(inputs,name);
    for(const r of matrix.requirements){
      const link=r.links.find(l=>l.id===id);
      if(link)impact.push({framework:name,ref:r.ref,title:r.title,coverage:link.coverage,applicability:r.applicability});
    }
  }
  return impact;
}
