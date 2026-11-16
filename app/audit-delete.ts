import { relationFields } from './connected-grc-model';
import { enterpriseCoreReferences } from './enterprise-core-references';
import { LifecycleConflict } from './enterprise-lifecycle-write';

export class AuditLinked extends Error {
  constructor() { super('Denetime bağlı CAPA, talep, çalışma kâğıdı veya başka kayıtlar var. Denetim ve geçmişi silinemez.'); }
}
type Row = Record<string, string | number | null>;
const childTables = ['audit_requests','audit_request_events','audit_request_workflows','audit_reminder_profiles',
  'audit_workpapers','audit_workpaper_events','audit_milestones','audit_milestone_events',
  'audit_workplan_closures','audit_workplan_closure_items','audit_workplan_events',
  'audit_closure_state','audit_closure_events','audit_status_reports'];

async function deletionContext(db: D1Database, audit: Row) {
  const id = String(audit.id), name = String(audit.name);
  const requirements = (await db.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?").bind(name).all<Row>()).results;
  const enterprise = await enterpriseCoreReferences(db, 'Denetim Yönetimi');
  const names = JSON.stringify(childTables);
  const catalogSql = "SELECT name FROM sqlite_master WHERE type='table' AND name IN (SELECT value FROM json_each(?))";
  const available = (await db.prepare(catalogSql).bind(names).all<{name:string}>()).results.map(r=>r.name);
  const rules = Object.entries(relationFields).filter(([,r])=>r.modules.includes('Denetim Yönetimi')).map(([field,r])=>({field,sources:r.sources||null}));
  const core = `SELECT part.value FROM simple_grc_records source JOIN json_each(?) rule
    JOIN json_each(CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END) field
    JOIN json_each(CASE WHEN field.type='array' THEN field.value ELSE json_array(field.value) END) part
    WHERE field.key=json_extract(rule.value,'$.field') AND part.type='text'
    AND (json_type(rule.value,'$.sources')='null' OR source.module IN (SELECT value FROM json_each(rule.value,'$.sources')))`;
  const refs = [core,...enterprise.selects].map(raw=>`EXISTS (WITH RECURSIVE raw(value) AS (${raw}), tokens(token,rest) AS (
    SELECT '',replace(replace(replace(replace(value,',',';'),'|',';'),char(10),';'),char(13),';')||';' FROM raw
    UNION ALL SELECT trim(substr(rest,1,instr(rest,';')-1)),substr(rest,instr(rest,';')+1) FROM tokens WHERE rest<>''
  ) SELECT 1 FROM tokens WHERE lower(token) IN (SELECT lower(value) FROM targets))`);
  const targets = `WITH targets(value) AS (SELECT ? UNION SELECT r.id FROM simple_grc_records r WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=? UNION SELECT c.code FROM simple_grc_record_codes c JOIN simple_grc_records r ON r.id=c.record_id WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=?)`;
  const linkedSql = `${targets} SELECT 1 WHERE ${[...refs,...available.map(table=>`EXISTS(SELECT 1 FROM ${table} WHERE audit_id=?)`)].join(' OR ')}`;
  const linkedValues = [id,name,name,JSON.stringify(rules),...available.map(()=>id)];
  return {id,name,requirements,enterprise,names,catalogSql,available,linkedSql,linkedValues,externalSql: `${targets} SELECT 1 WHERE ${refs.join(' OR ')}`};
}

/** Advisory only. DELETE repeats the dependency and snapshot checks atomically. */
export async function previewAuditDeletion(db: D1Database, audit: Row) {
  const context = await deletionContext(db, audit);
  const {id,available,linkedSql,linkedValues,requirements} = context;
  const labels: Record<string, [string,string,string]> = {
    audit_requests:['Kanıt talepleri','Evidence requests','requests'], audit_request_events:['Talep geçmişi','Request history','requests'],
    audit_request_workflows:['Talep iş akışı','Request workflow','requests'], audit_reminder_profiles:['Hatırlatma takvimi','Reminder calendar','requests'],
    audit_workpapers:['Çalışma kâğıtları','Workpapers','workpapers'], audit_workpaper_events:['Test geçmişi','Test history','workpapers'],
    audit_milestones:['Plan görevleri','Plan milestones','plan'], audit_milestone_events:['Plan geçmişi','Plan history','plan'],
    audit_workplan_closures:['İş planı kapanışları','Workplan closures','requests'], audit_workplan_closure_items:['Kapanış kalemleri','Closure items','requests'],
    audit_workplan_events:['İş planı geçmişi','Workplan history','requests'], audit_closure_state:['Kapanış kaydı','Closure record','closure'],
    audit_closure_events:['Kapanış kararları','Closure decisions','closure'], audit_status_reports:['Denetim raporları','Audit reports','reports'],
  };
  const counts = await db.batch(available.map(table=>db.prepare(`SELECT count(*) AS count FROM ${table} WHERE audit_id=?`).bind(id)));
  const blockers = available.flatMap((table,index)=>{
    const count=Number((counts[index].results[0] as {count:number})?.count||0);
    return count ? [{kind:table,count,label:labels[table][0],labelEn:labels[table][1],section:labels[table][2]}] : [];
  });
  const linked = !!await db.prepare(linkedSql).bind(...linkedValues).first();
  // External references can coexist with workflow blockers. Do not invent an exact record count.
  const externalSql=context.externalSql;
  const external=!!await db.prepare(externalSql).bind(...linkedValues.slice(0,4)).first();
  if(external) blockers.push({kind:'references',count:0,label:'Bağlı GRC kayıtları',labelEn:'Linked GRC records',section:'connections'});
  return {canDelete:!linked,requirementCount:requirements.length,blockers};
}

/** Claim the exact snapshot and its dependency check inside the same atomic batch as deletion. */
export async function deleteAudit(db: D1Database, audit: Row, actor: string) {
  const {id,name,requirements,enterprise,names,catalogSql,available,linkedSql,linkedValues} = await deletionContext(db,audit);
  const chunks: Row[][] = []; let chunk: Row[] = [], size = 0;
  for (const row of requirements) {
    const bytes = new TextEncoder().encode(JSON.stringify(row)).length;
    if (size + bytes > 400000 && chunk.length) { chunks.push(chunk); chunk=[]; size=0; }
    chunk.push(row); size+=bytes;
  }
  if (chunk.length) chunks.push(chunk);
  const now = new Date().toISOString(), operation = crypto.randomUUID(), key = `audit_archive_${id}`;
  const snapshotKeys = ['id','name','template','audit_type','auditor','audit_owner','status','created_at','updated_at'];
  const snapshots = chunks.map(rows=>JSON.stringify(rows));
  const snapshotGuard = snapshots.map(()=>`NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM simple_grc_records r WHERE r.id=json_extract(s.value,'$.id') AND r.module='Denetim Yönetimi' AND r.data_json=json_extract(s.value,'$.data_json') AND r.created_at=json_extract(s.value,'$.created_at') AND r.updated_at=json_extract(s.value,'$.updated_at')))`);
  const claimed = "EXISTS(SELECT 1 FROM simple_grc_metadata WHERE key=? AND json_extract(value,'$.operation')=?)";
  const results = await db.batch([
    db.prepare(`INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,?
      WHERE EXISTS(SELECT 1 FROM simple_audits WHERE ${snapshotKeys.map(k=>`${k} IS ?`).join(' AND ')})
      AND ${enterprise.schemaSql} AND (SELECT count(*) FROM (${catalogSql}))=?
      AND NOT EXISTS(${linkedSql})
      AND (SELECT count(*) FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?)=?
      ${snapshotGuard.map(g=>'AND '+g).join(' ')}`)
      .bind(key,JSON.stringify({audit,operation,requirementsChunkCount:chunks.length,requirementCount:requirements.length,deletedAt:now,deletedBy:actor}),now,
        ...snapshotKeys.map(k=>audit[k]),...enterprise.schemaValues,names,available.length,...linkedValues,name,requirements.length,...snapshots),
    ...snapshots.map((data,index)=>db.prepare(`INSERT OR REPLACE INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,? WHERE ${claimed}`).bind(`${key}_requirements_${index}`,data,now,key,operation)),
    db.prepare(`DELETE FROM simple_grc_record_codes WHERE record_id IN (SELECT id FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=?) AND ${claimed}`).bind(name,key,operation),
    db.prepare(`DELETE FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=? AND ${claimed}`).bind(name,key,operation),
    db.prepare(`DELETE FROM simple_audits WHERE id=? AND ${claimed}`).bind(id,key,operation),
  ]);
  if (Number(results[0]?.meta?.changes||0)<1) {
    if (await db.prepare(linkedSql).bind(...linkedValues).first()) throw new AuditLinked();
    throw new LifecycleConflict();
  }
  return requirements.length;
}
