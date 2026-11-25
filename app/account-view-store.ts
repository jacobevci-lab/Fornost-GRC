import type { Actor } from './api/auth/security';
import { completedInitialization } from './completed-initialization';
import { parseModuleAccess } from './module-access';
import { AccountViewError, accountViewState, canReadView, viewId, viewModule, viewNameKey, viewScope, type AccountView, type TeamViewVersion, type TeamViewHistory } from './account-views';

const initialize = completedInitialization();
export async function ensureAccountViewSchema(db: D1Database) {
  await initialize(db, async () => { await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS account_views(id TEXT PRIMARY KEY,module TEXT NOT NULL,scope TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,name_key TEXT NOT NULL,state_json TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS account_views_name_idx ON account_views(module,scope,owner_id,name_key) WHERE deleted=0`),
    db.prepare(`CREATE INDEX IF NOT EXISTS account_views_list_idx ON account_views(module,scope,owner_id,deleted,name_key,id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS team_view_versions(revision TEXT PRIMARY KEY,view_id TEXT NOT NULL,version INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,source_revision TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(view_id,version))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS team_view_versions_history_idx ON team_view_versions(view_id,version DESC)`),
    ...['UPDATE','DELETE'].map(op=>db.prepare(`CREATE TRIGGER IF NOT EXISTS team_view_versions_no_${op.toLowerCase()} BEFORE ${op} ON team_view_versions BEGIN SELECT RAISE(ABORT,'immutable-view-version'); END`)),
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
type StoredVersion = TeamViewVersion & { snapshot_json: string };
const historyFields = 'revision,version,action,actor,note,source_revision AS sourceRevision,created_at AS createdAt,snapshot_json';
function snapshot(value:string, id:string, moduleName:string):AccountView {
  const row=JSON.parse(value) as AccountView;
  if(row.id!==id||row.module!==moduleName||row.scope!=='team'||typeof row.name!=='string'||!row.name.trim()||row.name.length>60||typeof row.revision!=='string'||!row.revision||typeof row.updatedAt!=='string')throw new AccountViewError('schema');
  return {...row,state:accountViewState(moduleName,row.state)};
}
export async function readTeamViewHistory(db:D1Database,actor:Actor,input:{module:unknown;scope:unknown;id:unknown;revision?:unknown}):Promise<TeamViewHistory> {
  const moduleName=viewModule(input.module),scope=viewScope(input.scope),id=viewId(input.id),revision=input.revision,who=await identity(db,actor);
  if(scope!=='team'||(revision!==undefined&&(typeof revision!=='string'||!revision||revision.length>100)))throw new AccountViewError('fields');
  if(!canReadView(who,moduleName))throw new AccountViewError('forbidden',403);
  await ensureAccountViewSchema(db);
  // Read the current definition, history and exact snapshot in one guarded transaction.
  const [access,current,history,exact]=await db.batch([
    db.prepare(`SELECT 1 AS allowed WHERE ${liveGuard}`).bind(...liveArgs(who)),
    db.prepare(`SELECT * FROM account_views WHERE id=? AND module=? AND scope='team' AND owner_id='' AND deleted=0 AND ${liveGuard}`).bind(id,moduleName,...liveArgs(who)),
    db.prepare(`SELECT ${historyFields} FROM team_view_versions WHERE view_id=? AND ${liveGuard} ORDER BY version DESC LIMIT 51`).bind(id,...liveArgs(who)),
    db.prepare(`SELECT snapshot_json FROM team_view_versions WHERE view_id=? AND revision=? AND ${liveGuard}`).bind(id,revision||'',...liveArgs(who)),
  ]);
  if(!access.results.length)throw new AccountViewError('forbidden',403);
  if(!current.results.length)throw new AccountViewError('missing',404);
  const row=unpack(current.results[0] as Stored);
  if(!canReadView(who,moduleName,row.state))throw new AccountViewError('missing',404);
  let selected=row;
  if(revision&&revision!==row.revision){
    const old=exact.results[0] as {snapshot_json:string}|undefined;
    if(!old)throw new AccountViewError('missing',404);
    selected=snapshot(old.snapshot_json,id,moduleName);
    if(!canReadView(who,moduleName,selected.state))throw new AccountViewError('missing',404);
  }
  const versions=(history.results as StoredVersion[]).slice(0,50).filter(item=>canReadView(who,moduleName,snapshot(item.snapshot_json,id,moduleName).state)).map(({snapshot_json:_snapshot,...item})=>{void _snapshot;return item;});
  return {current:row,selected,history:versions,historyComplete:history.results.length<=50};
}
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
  if (Object.keys(input).some(key=>!['id','module','scope','action','name','state','expectedRevision','sourceRevision','note'].includes(key)) || !['save','rename','delete','restore'].includes(String(input.action)) || typeof input.expectedRevision!=='string' || input.expectedRevision.length>100) throw new AccountViewError('fields');
  const moduleName=viewModule(input.module),scope=viewScope(input.scope),id=viewId(input.id),action=input.action,who=await identity(db,actor),owner=scope==='personal'?actor.id:'';
  if (!canReadView(who,moduleName) || (scope==='team' && who.role!=='Admin')) throw new AccountViewError('forbidden',403);
  await ensureAccountViewSchema(db);
  const old=await db.prepare('SELECT * FROM account_views WHERE id=?').bind(id).first<Stored>();
  // An ID cannot be moved between users, scopes or modules. Tombstones prevent late create retries from resurrecting deletions.
  if (old && (old.module!==moduleName || old.scope!==scope || old.owner_id!==owner || old.deleted)) throw new AccountViewError('conflict',409);
  if ((old?.revision||'')!==input.expectedRevision || (!old && action!=='save')) throw new AccountViewError('conflict',409);
  if((input.note!==undefined&&(typeof input.note!=='string'||input.note.length>500))||(scope==='personal'&&(input.note!==undefined||input.sourceRevision!==undefined||action==='restore'))||(action!=='restore'&&input.sourceRevision!==undefined))throw new AccountViewError('fields');
  const note=typeof input.note==='string'?input.note.trim():'';
  let restored:AccountView|undefined;
  if(action==='restore'){
    if(typeof input.sourceRevision!=='string'||!input.sourceRevision||input.sourceRevision.length>100||input.sourceRevision===old!.revision||input.name!==undefined||input.state!==undefined)throw new AccountViewError('fields');
    if(note.length<3)throw new AccountViewError('reason');
    const source=await db.prepare('SELECT snapshot_json,action FROM team_view_versions WHERE view_id=? AND revision=?').bind(id,input.sourceRevision).first<{snapshot_json:string;action:string}>();
    if(!source||source.action==='delete')throw new AccountViewError('missing',404);
    restored=snapshot(source.snapshot_json,id,moduleName);
  }
  const name=action==='delete'?'':restored?.name||(typeof input.name==='string'?input.name.trim():'');
  if (action!=='delete' && (!name || name.length>60)) throw new AccountViewError('name');
  const state=restored?.state||(action==='save'?accountViewState(moduleName,input.state):unpack(old!).state);
  if (!canReadView(who,moduleName,state)) throw new AccountViewError('forbidden',403);
  const key=viewNameKey(name),revision=crypto.randomUUID(),stamp=now.toISOString(),limit=scope==='personal'?20:50;
  if (action!=='delete' && await db.prepare('SELECT id FROM account_views WHERE module=? AND scope=? AND owner_id=? AND name_key=? AND deleted=0 AND id<>?').bind(moduleName,scope,owner,key,id).first()) throw new AccountViewError('duplicate',409);
  if (!old && (await db.prepare('SELECT count(*) n FROM account_views WHERE module=? AND scope=? AND owner_id=? AND deleted=0').bind(moduleName,scope,owner).first<{n:number}>())!.n>=limit) throw new AccountViewError('limit',409);
  let result;
  try {
    const write=db.prepare(`INSERT INTO account_views(id,module,scope,owner_id,name,name_key,state_json,revision,updated_at,deleted)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${liveGuard}
      AND COALESCE((SELECT revision FROM account_views WHERE id=?),'')=?
      AND NOT EXISTS(SELECT 1 FROM account_views WHERE id=? AND (deleted=1 OR module<>? OR scope<>? OR owner_id<>?))
      AND (EXISTS(SELECT 1 FROM account_views WHERE id=?) OR (SELECT count(*) FROM account_views WHERE module=? AND scope=? AND owner_id=? AND deleted=0)<?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,state_json=excluded.state_json,revision=excluded.revision,updated_at=excluded.updated_at,deleted=excluded.deleted RETURNING id`)
      .bind(id,moduleName,scope,owner,name,key,action==='delete'?'{}':JSON.stringify(state),revision,stamp,action==='delete'?1:0,...liveArgs(who),id,input.expectedRevision,id,moduleName,scope,owner,id,moduleName,scope,owner,limit);
    if(scope==='personal')result=await write.all();
    else {
      const previous=(await db.prepare('SELECT COALESCE(max(version),0) n FROM team_view_versions WHERE view_id=?').bind(id).first<{n:number}>())!.n;
      const statements=[write];
      const append=(snapshotValue:AccountView,version:number,event:string,actorEmail:string,reason:string,source:string)=>db.prepare(`INSERT INTO team_view_versions(revision,view_id,version,action,actor,note,source_revision,snapshot_json,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_views WHERE id=? AND revision=?)`).bind(snapshotValue.revision,id,version,event,actorEmail,reason,source,JSON.stringify(snapshotValue),snapshotValue.updatedAt,id,revision);
      // Preserve the last known legacy definition without inventing an earlier author or history.
      if(old&&!previous)statements.push(append(unpack(old),1,'baseline','','',''));
      statements.push(append({id,module:moduleName,scope,name:action==='delete'?old!.name:name,state,revision,updatedAt:stamp},Math.max(previous,old?1:0)+1,String(action),who.email,note,restored?.revision||''));
      result=(await db.batch(statements))[0];
    }
  } catch(error) { if (String(error).includes('UNIQUE constraint failed: account_views.')) throw new AccountViewError('conflict',409); throw error; }
  if (!result.results.length) throw new AccountViewError('conflict',409);
  return {id,revision};
}
