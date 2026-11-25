import { validateAuditTeam, auditTypes } from './audit-engagement';
import { LifecycleConflict, nextLifecycleStamp } from './enterprise-lifecycle-write';
import { relationFields } from './connected-grc-model';
import { enterpriseCoreReferences } from './enterprise-core-references';
import { auditChildTables } from './audit-delete';

type Audit = Record<string, string | number | null>;
export type AuditDependency = { key: string; count: number; area: 'work' | 'requests' | 'findings' | 'report'; };
export type AuditRemovalPreview = { requirements: number; dependencies: AuditDependency[]; blocked: boolean };

export async function auditRemovalPreview(db: D1Database, audit: Audit): Promise<AuditRemovalPreview> {
  const targets = `WITH RECURSIVE targets(value) AS (SELECT ? UNION SELECT r.id FROM simple_grc_records r WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=? UNION SELECT c.code FROM simple_grc_record_codes c JOIN simple_grc_records r ON r.id=c.record_id WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=?)`;
  const args = [audit.id, audit.name, audit.name];
  const matching = (raw: string) => `${targets}, raw(value) AS (${raw}), tokens(token,rest) AS (
    SELECT '',replace(replace(replace(replace(value,',',';'),'|',';'),char(10),';'),char(13),';')||';' FROM raw
    UNION ALL SELECT trim(substr(rest,1,instr(rest,';')-1)),substr(rest,instr(rest,';')+1) FROM tokens WHERE rest<>''
  ) SELECT count(*) AS count FROM tokens WHERE lower(token) IN (SELECT lower(value) FROM targets)`;
  const rules = Object.entries(relationFields).filter(([,r])=>r.modules.includes('Denetim Yönetimi')).map(([field,r])=>({field,sources:r.sources||null}));
  const core = `SELECT part.value FROM simple_grc_records source JOIN json_each(?) rule
    JOIN json_each(CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END) field
    JOIN json_each(CASE WHEN field.type='array' THEN field.value ELSE json_array(field.value) END) part
    WHERE field.key=json_extract(rule.value,'$.field') AND part.type='text'
    AND (json_type(rule.value,'$.sources')='null' OR source.module IN (SELECT value FROM json_each(rule.value,'$.sources')))`;
  const dependencies: AuditDependency[] = [];
  const coreCount = await db.prepare(matching(core)).bind(...args, JSON.stringify(rules)).first<{count:number}>();
  if (coreCount?.count) dependencies.push({key:'record_links',count:coreCount.count,area:'work'});
  const enterprise = await enterpriseCoreReferences(db, 'Denetim Yönetimi');
  for (let i=0;i<enterprise.selects.length;i++) {
    if(["audit_requests","audit_workpapers"].includes(enterprise.tables[i]))continue;
    const count = await db.prepare(matching(enterprise.selects[i])).bind(...args).first<{count:number}>();
    if (count?.count) dependencies.push({key:enterprise.tables[i],count:count.count,area:enterprise.tables[i]==='enterprise_findings'?'findings':'work'});
  }
  const available = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (SELECT value FROM json_each(?))").bind(JSON.stringify(auditChildTables)).all<{name:string}>();
  for (const {name} of available.results) {
    const count = await db.prepare(`SELECT count(*) AS count FROM ${name} WHERE audit_id=?`).bind(audit.id).first<{count:number}>();
    if (count?.count) dependencies.push({key:name,count:count.count,area:name.includes('closure')||name.includes('status_report')?'report':name.includes('request')||name.includes('reminder')?'requests':'work'});
  }
  const requirements = await db.prepare("SELECT count(*) AS count FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(audit.name).first<{count:number}>();
  return {requirements:requirements?.count||0,dependencies,blocked:dependencies.length>0};
}

/** Snapshot claim and event are committed together. Stale editors cannot overwrite newer decisions. */
export async function updateAudit(db: D1Database, audit: Audit, actor: string, input: Record<string,unknown>) {
  if (input.expectedUpdatedAt !== audit.updated_at) throw new LifecycleConflict();
  const action = input.action;
  if (!['edit','archive','restore'].includes(String(action))) throw new Error('fields');
  const visibility=action==='edit'?null:await db.prepare('SELECT updated_at FROM simple_grc_metadata WHERE key=?').bind(`audit_visibility_${audit.id}`).first<{updated_at:string}>();
  const previous=visibility&&Date.parse(visibility.updated_at)>Date.parse(String(audit.updated_at))?visibility.updated_at:audit.updated_at;
  const stamp = nextLifecycleStamp(previous), operation = crypto.randomUUID();
  const next = {...audit};
  if (action === 'edit') {
    for (const key of ['name','audit_type','auditor','audit_owner'] as const) {
      const value=input[key];
      if(typeof value!=='string'||value.length>(key==='auditor'?5400:key==='audit_owner'?254:160)||/[\u0000-\u001f]/.test(value))throw new Error('fields');
      next[key]=value.trim();
    }
    const changed=next.audit_owner!==audit.audit_owner || next.auditor!==audit.auditor || next.audit_type!==audit.audit_type;
    if(changed){
      const structured=!!await db.prepare("SELECT 1 FROM simple_grc_metadata WHERE key=? AND json_extract(value,'$.structuredTeam')=1").bind('audit_catalog_'+audit.id).first();
      validateAuditTeam(String(next.audit_owner),String(next.auditor),structured);
      if(structured && (!auditTypes.some(([t])=>t===next.audit_type) || next.audit_owner && !await db.prepare("SELECT 1 FROM local_users WHERE status='Active' AND lower(email)=lower(?)").bind(next.audit_owner).first()))throw new Error('fields');
    }
    if(String(next.name).length<3||!next.audit_type)throw new Error('fields');
  }
  if(action==='edit')next.updated_at=stamp;
  const claimed=action==='edit'?"EXISTS(SELECT 1 FROM simple_audits WHERE id=? AND updated_at=?)":"EXISTS(SELECT 1 FROM simple_grc_metadata WHERE key='audit_visibility_'||? AND updated_at=?)";
  const statements = action==='edit'?[db.prepare(`UPDATE simple_audits SET name=?,audit_type=?,auditor=?,audit_owner=?,updated_at=? WHERE id=? AND updated_at=?`).bind(next.name,next.audit_type,next.auditor,next.audit_owner,stamp,audit.id,audit.updated_at)]:[
    db.prepare(`INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=? AND updated_at=?) AND COALESCE((SELECT updated_at FROM simple_grc_metadata WHERE key=?),'')=?`).bind(`audit_visibility_${audit.id}`,JSON.stringify({archived:action==='archive',actor,at:stamp}),stamp,audit.id,audit.updated_at,`audit_visibility_${audit.id}`,input.expectedVisibilityRevision||'')
  ];
  if(action==='edit' && audit.name!==next.name) statements.push(db.prepare(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.auditName',?),updated_at=? WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=? AND ${claimed}`).bind(next.name,stamp,audit.name,audit.id,stamp));
  statements.push(db.prepare(`INSERT INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,? WHERE ${claimed}`).bind(`audit_management_${audit.id}_${operation}`,JSON.stringify({action,actor,before:audit,after:next,at:stamp}),stamp,audit.id,stamp));
  const result=await db.batch(statements);
  if(Number(result[0]?.meta?.changes||0)<1)throw new LifecycleConflict();
  return next;
}
