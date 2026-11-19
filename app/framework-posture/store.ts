import { completedInitialization } from '../completed-initialization';
import { evaluateEvidenceEligibility } from '../evidence/eligibility';
import { ensureEvidenceHistorySchema, verifyEvidenceVersionChainWithAnchor, splitEvidenceControlRefs, normalizeEvidenceControlRef, type EvidenceVersionRow } from '../evidence/versioning';
import { catalogFor, frameworkNames, programName } from './catalog';
import type { Baseline, Control, Mapping, Matrix, Pin, Requirement } from './types';

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
    controls.push({id:r.id,code,title:str(data.controlTitle)||str(data.title)||code,implementation:str(data.implementation)});
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
  const mapped=new Set(requirements.flatMap(r=>r.links.map(l=>l.id)));
  const pins:Record<string,Pin[]> = Object.create(null);
  if(mapped.size){
    await ensureEvidenceHistorySchema(db);
    const eligibleRefs=[...aliases].filter(([,ids])=>ids.size===1 && mapped.has([...ids][0])).map(([alias])=>alias);
    const versions=await db.prepare(`SELECT v.*,r.data_json FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar'
      WHERE v.evidence_id IN (SELECT ec.evidence_id FROM evidence_version_controls ec WHERE ec.normalized_ref IN (SELECT value FROM json_each(?)))
      ORDER BY v.evidence_id,v.version_no`).bind(JSON.stringify(eligibleRefs)).all<EvidenceVersionRow & {data_json:string}>();
    const groups=new Map<string,typeof versions.results>();
    for(const v of versions.results){const group=groups.get(v.evidence_id)??[];group.push(v);groups.set(v.evidence_id,group);}
    for(const group of groups.values()){
      const v=group[group.length-1], data=JSON.parse(v.data_json);
      if(!evaluateEvidenceEligibility(data).current || !['onaylandı','approved','accepted','kabul edildi'].includes(key(data.status)) ||
        v.content_sha256!==data.contentSha256 || v.period!==str(data.period) || !v.period)continue;
      if((await verifyEvidenceVersionChainWithAnchor(group,{versionNo:data.versionNo,chainSha256:data.versionChainSha256})).state!=='verified')continue;
      const currentRefs=new Set(splitEvidenceControlRefs(data.controlRefs||data.controlRef).map(key));
      const ids=new Set<string>();
      for(const ref of splitEvidenceControlRefs(v.control_refs)){
        const idsForRef=aliases.get(key(ref));
        if(currentRefs.has(key(ref)) && idsForRef?.size===1)ids.add([...idsForRef][0]);
      }
      for(const id of ids)if(mapped.has(id))(pins[id]??=[]).push({id:v.id,evidenceId:v.evidence_id,fileKey:v.file_key,title:v.evidence_title,version:v.version_no,hash:v.content_sha256,period:v.period});
    }
  }
  return {name,requirements,controls,pins};
}

export async function saveDecision(db:D1Database, body:Record<string,unknown>, actor:string) {
  const program=str(body.name),ref=str(body.ref),item=catalogFor(program).find(r=>r.ref===ref),app=str(body.applicability),reason=str(body.reason);
  if(!item || !Array.isArray(body.links) || body.links.length>250 || typeof body.revision!=='string' || reason.length>2000 ||
     !(item.annex?['included','excluded','undecided']:['required']).includes(app) ||
     (['included','excluded'].includes(app)&&!reason))throw new PostureError('decision');
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
    controls:r.links.flatMap(link=>{
      const c=controls.get(link.id);if(!c)return [];
      const pins=(matrix.pins[c.id]??[]).filter(p=>p.period===period && r.applicability!=='excluded');
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
