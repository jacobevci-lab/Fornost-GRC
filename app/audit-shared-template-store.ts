import type {Actor} from './api/auth/security';
import {canReadModule} from './module-access';
import {AuditRequestError} from './audit-requests';
import {completedInitialization} from './completed-initialization';
import {sharedTemplateKind,validateSharedTemplate,type SharedTemplateRecord,type SharedTemplateSummary,type SharedTemplateVersion} from './audit-shared-templates';

const schema=[
 `CREATE TABLE IF NOT EXISTS audit_shared_templates(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,revision TEXT NOT NULL,version INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,template_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS audit_shared_templates_kind_idx ON audit_shared_templates(kind,archived,name,id)`,
 `CREATE TABLE IF NOT EXISTS audit_shared_template_versions(revision TEXT PRIMARY KEY,template_id TEXT NOT NULL,version INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(template_id,version))`,
 `CREATE INDEX IF NOT EXISTS audit_shared_template_history_idx ON audit_shared_template_versions(template_id,version DESC)`,
 ...['UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS audit_shared_template_versions_no_${op.toLowerCase()} BEFORE ${op} ON audit_shared_template_versions BEGIN SELECT RAISE(ABORT,'immutable-template-version'); END`),
];
const initialize=completedInitialization();
export async function ensureSharedTemplateSchema(db:D1Database){await initialize(db,async()=>{await db.batch(schema.map(sql=>db.prepare(sql)));});}
type Stored={id:string;kind:string;name:string;revision:string;version:number;archived:number;template_json:string;created_at:string;updated_at:string;updated_by:string};
function templateId(value:unknown){if(typeof value!=='string'||!/^AST-[a-f0-9-]{36}$/.test(value))throw new AuditRequestError('fields');return value;}
function summary(row:Stored):SharedTemplateSummary{return {id:row.id,kind:sharedTemplateKind(row.kind),name:row.name,revision:row.revision,version:row.version,archived:!!row.archived,updatedBy:row.updated_by,updatedAt:row.updated_at};}
function record(row:Stored):SharedTemplateRecord{return {...summary(row),template:validateSharedTemplate(JSON.parse(row.template_json)),createdAt:row.created_at};}
function readable(actor:Actor){if(!canReadModule(actor,'Denetim Yönetimi'))throw new AuditRequestError('forbidden',403);}
export async function listSharedTemplates(db:D1Database,actor:Actor,kind:unknown,archived=false){
 readable(actor);const selected=sharedTemplateKind(kind);await ensureSharedTemplateSchema(db);
 const rows=await db.prepare('SELECT id,kind,name,revision,version,archived,updated_at,updated_by FROM audit_shared_templates WHERE kind=? AND archived=? ORDER BY name COLLATE NOCASE,id LIMIT 201').bind(selected,archived?1:0).all<Stored>();
 return {templates:rows.results.slice(0,200).map(summary),complete:rows.results.length<=200,canManage:actor.role==='Admin'};
}
export async function readSharedTemplate(db:D1Database,actor:Actor,id:unknown,revision?:string){
 readable(actor);const key=templateId(id);await ensureSharedTemplateSchema(db);
 const current=await db.prepare('SELECT * FROM audit_shared_templates WHERE id=?').bind(key).first<Stored>();
 if(!current)throw new AuditRequestError('missing',404);
 // Archived definitions remain inspectable; only a currently active definition may be applied.
 const versions=await db.prepare('SELECT revision,version,action,actor,note,created_at AS createdAt FROM audit_shared_template_versions WHERE template_id=? ORDER BY version DESC LIMIT 51').bind(key).all<SharedTemplateVersion>();
 let selected=record(current);
 if(revision&&revision!==current.revision){
  const old=await db.prepare('SELECT snapshot_json FROM audit_shared_template_versions WHERE template_id=? AND revision=?').bind(key,revision).first<{snapshot_json:string}>();
  if(!old)throw new AuditRequestError('missing',404);selected=JSON.parse(old.snapshot_json);validateSharedTemplate(selected.template);
 }
 return {current:summary(current),selected,history:versions.results.slice(0,50),historyComplete:versions.results.length<=50};
}
export async function mutateSharedTemplate(db:D1Database,actor:Actor,input:Record<string,unknown>,now=new Date()){
 if(actor.role!=='Admin')throw new AuditRequestError('forbidden',403);
 const id=templateId(input.id),action=input.action,email=actor.email.toLowerCase();
 if(Object.keys(input).some(key=>!['id','action','expectedRevision','template','note'].includes(key))||!['save','archive','restore'].includes(String(action))||typeof input.expectedRevision!=='string'||input.expectedRevision.length>100||typeof input.note!=='string'||input.note.trim().length<3||input.note.length>2000)throw new AuditRequestError('fields');
 await ensureSharedTemplateSchema(db);
 const raw=await db.prepare('SELECT * FROM audit_shared_templates WHERE id=?').bind(id).first<Stored>();
 if((raw?.revision||'')!==input.expectedRevision)throw new AuditRequestError('conflict',409);
 if(action!=='save'&&!raw)throw new AuditRequestError('missing',404);
 if((action==='save'&&raw?.archived)||(action==='archive'&&raw?.archived)||(action==='restore'&&!raw?.archived))throw new AuditRequestError('transition',409);
 let template;
 try{template=action==='save'?validateSharedTemplate(input.template):record(raw!).template;}catch{throw new AuditRequestError('fields');}
 if(raw&&raw.kind!==template.kind)throw new AuditRequestError('fields');
 const stamp=now.toISOString(),revision=crypto.randomUUID(),version=(raw?.version||0)+1,archived=action==='archive';
 const next:SharedTemplateRecord={id,kind:template.kind,name:template.name,revision,version,archived,template,createdAt:raw?.created_at||stamp,updatedAt:stamp,updatedBy:email};
 const result=await db.batch([
  db.prepare(`INSERT INTO audit_shared_templates(id,kind,name,revision,version,archived,template_json,created_at,updated_at,updated_by)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM audit_shared_templates WHERE id=?),'')=?
   AND (EXISTS(SELECT 1 FROM audit_shared_templates WHERE id=?) OR (SELECT count(*) FROM audit_shared_templates WHERE kind=?)<200)
   AND EXISTS(SELECT 1 FROM local_users WHERE id=? AND lower(email)=? AND role='Admin' AND status='Active')
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,version=excluded.version,archived=excluded.archived,template_json=excluded.template_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by RETURNING id`)
   .bind(id,next.kind,next.name,revision,version,archived?1:0,JSON.stringify(template),next.createdAt,stamp,email,id,input.expectedRevision,id,next.kind,actor.id,email),
  db.prepare(`INSERT INTO audit_shared_template_versions(revision,template_id,version,action,actor,note,snapshot_json,created_at)
   SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_shared_templates WHERE id=? AND revision=?)`)
   .bind(revision,id,version,action,email,input.note.trim(),JSON.stringify(next),stamp,id,revision),
 ]);
 if(!result[0].results.length)throw new AuditRequestError('conflict',409);
 return {id,revision,version};
}
