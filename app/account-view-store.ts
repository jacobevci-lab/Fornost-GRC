import type { Actor } from './api/auth/security';
import { completedInitialization } from './completed-initialization';
import { parseModuleAccess } from './module-access';
import { AccountViewError, accountViewState, canReadView, viewId, viewModule, viewNameKey, viewScope, type AccountView } from './account-views';

const initialize = completedInitialization();
export async function ensureAccountViewSchema(db: D1Database) {
  await initialize(db, async () => { await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS account_views(id TEXT PRIMARY KEY,module TEXT NOT NULL,scope TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,name_key TEXT NOT NULL,state_json TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS account_views_name_idx ON account_views(module,scope,owner_id,name_key) WHERE deleted=0`),
    db.prepare(`CREATE INDEX IF NOT EXISTS account_views_list_idx ON account_views(module,scope,owner_id,deleted,name_key,id)`),
  ]); });
}
type Stored = { id:string; module:string; scope:'personal'|'team'; owner_id:string; name:string; state_json:string; revision:string; updated_at:string; deleted:number };
type Identity = { id:string; email:string; role:Actor['role']; policy:string|null };
async function identity(db:D1Database, actor:Actor) {
  const current = await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.status='Active'`).bind(actor.id,actor.email.toLowerCase()).first<Identity>();
  if (!current || !['Admin','Editor','Viewer'].includes(current.role) || current.role !== actor.role) throw new AccountViewError('forbidden',403);
  return { ...current, moduleAccess:parseModuleAccess(current.policy) };
}
function unpack(row:Stored):AccountView { return { id:row.id,module:row.module,scope:row.scope,name:row.name,state:accountViewState(row.module,JSON.parse(row.state_json)),revision:row.revision,updatedAt:row.updated_at }; }
const liveGuard = `EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)`;
const liveArgs = (who:Identity) => [who.id,who.email,who.role,who.policy];
export async function readAccountViews(db:D1Database, actor:Actor, input:{module:unknown;scope:unknown;id?:unknown}) {
  const moduleName=viewModule(input.module),scope=viewScope(input.scope),id=input.id===undefined?undefined:viewId(input.id),who=await identity(db,actor);
  if (!canReadView(who,moduleName)) throw new AccountViewError('forbidden',403);
  await ensureAccountViewSchema(db);
  const owner=scope==='personal'?actor.id:'',limit=scope==='personal'?20:50;
  const [access,result]=await db.batch([
    db.prepare(`SELECT 1 AS allowed WHERE ${liveGuard}`).bind(...liveArgs(who)),
    db.prepare(`SELECT * FROM account_views WHERE module=? AND scope=? AND owner_id=? AND deleted=0 ${id?'AND id=?':''} AND ${liveGuard} ORDER BY name_key,id LIMIT ?`).bind(moduleName,scope,owner,...(id?[id]:[]),...liveArgs(who),limit+1),
  ]);
  if(!access.results.length)throw new AccountViewError('forbidden',403);
  const views=(result.results as Stored[]).slice(0,limit).map(unpack).filter(row=>canReadView(who,moduleName,row.state));
  if (id && !views.length) throw new AccountViewError('missing',404);
  return {views,complete:result.results.length<=limit,canManage:scope==='personal'||who.role==='Admin',limit};
}
export async function mutateAccountView(db:D1Database, actor:Actor, input:Record<string,unknown>, now=new Date()) {
  if (Object.keys(input).some(key=>!['id','module','scope','action','name','state','expectedRevision'].includes(key)) || !['save','rename','delete'].includes(String(input.action)) || typeof input.expectedRevision!=='string' || input.expectedRevision.length>100) throw new AccountViewError('fields');
  const moduleName=viewModule(input.module),scope=viewScope(input.scope),id=viewId(input.id),action=input.action,who=await identity(db,actor),owner=scope==='personal'?actor.id:'';
  if (!canReadView(who,moduleName) || (scope==='team' && who.role!=='Admin')) throw new AccountViewError('forbidden',403);
  await ensureAccountViewSchema(db);
  const old=await db.prepare('SELECT * FROM account_views WHERE id=?').bind(id).first<Stored>();
  // An ID cannot be moved between users, scopes or modules. Tombstones prevent late create retries from resurrecting deletions.
  if (old && (old.module!==moduleName || old.scope!==scope || old.owner_id!==owner || old.deleted)) throw new AccountViewError('conflict',409);
  if ((old?.revision||'')!==input.expectedRevision || (!old && action!=='save')) throw new AccountViewError('conflict',409);
  const name=action==='delete'?'':typeof input.name==='string'?input.name.trim():'';
  if (action!=='delete' && (!name || name.length>60)) throw new AccountViewError('name');
  const state=action==='save'?accountViewState(moduleName,input.state):unpack(old!).state;
  if (!canReadView(who,moduleName,state)) throw new AccountViewError('forbidden',403);
  const key=viewNameKey(name),revision=crypto.randomUUID(),stamp=now.toISOString(),limit=scope==='personal'?20:50;
  if (action!=='delete' && await db.prepare('SELECT id FROM account_views WHERE module=? AND scope=? AND owner_id=? AND name_key=? AND deleted=0 AND id<>?').bind(moduleName,scope,owner,key,id).first()) throw new AccountViewError('duplicate',409);
  if (!old && (await db.prepare('SELECT count(*) n FROM account_views WHERE module=? AND scope=? AND owner_id=? AND deleted=0').bind(moduleName,scope,owner).first<{n:number}>())!.n>=limit) throw new AccountViewError('limit',409);
  let result;
  try {
    result=await db.prepare(`INSERT INTO account_views(id,module,scope,owner_id,name,name_key,state_json,revision,updated_at,deleted)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${liveGuard}
      AND COALESCE((SELECT revision FROM account_views WHERE id=?),'')=?
      AND NOT EXISTS(SELECT 1 FROM account_views WHERE id=? AND (deleted=1 OR module<>? OR scope<>? OR owner_id<>?))
      AND (EXISTS(SELECT 1 FROM account_views WHERE id=?) OR (SELECT count(*) FROM account_views WHERE module=? AND scope=? AND owner_id=? AND deleted=0)<?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,state_json=excluded.state_json,revision=excluded.revision,updated_at=excluded.updated_at,deleted=excluded.deleted RETURNING id`)
      .bind(id,moduleName,scope,owner,name,key,action==='delete'?'{}':JSON.stringify(state),revision,stamp,action==='delete'?1:0,...liveArgs(who),id,input.expectedRevision,id,moduleName,scope,owner,id,moduleName,scope,owner,limit).all();
  } catch(error) { if (String(error).includes('UNIQUE constraint failed: account_views.')) throw new AccountViewError('conflict',409); throw error; }
  if (!result.results.length) throw new AccountViewError('conflict',409);
  return {id,revision};
}
