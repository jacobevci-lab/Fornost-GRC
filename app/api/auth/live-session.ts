import {parseModuleAccess} from '../../module-access';
import {sessionExpired,sessionTimeoutMinutes} from '../../session-policy';

export const SESSION_ACTIVITY_INTERVAL_MS = 60_000;
type SessionRow = {id:string;name:string;email:string;role:string;status:string;expires_at:string;created_at:string;last_seen_at:string;config_json:string|null;policy_json:string|null};

/** Read current account, grants and lifetime together; never cache authorization. */
export async function readLiveSession(db:D1Database, tokenHash:string, now=new Date()) {
 const row=await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,s.expires_at,s.created_at,s.last_seen_at,p.config_json,a.policy_json
  FROM local_sessions s JOIN local_users u ON u.id=s.user_id
  LEFT JOIN platform_settings p ON p.id='default' LEFT JOIN user_module_access a ON a.user_id=u.id
  WHERE s.id_hash=?`).bind(tokenHash).first<SessionRow>();
 if(!row||row.status!=='Active')return null;
 const stamp=now.toISOString();
 if(sessionExpired(row.created_at,row.expires_at,sessionTimeoutMinutes(row.config_json),now.getTime())){
  await db.prepare('DELETE FROM local_sessions WHERE id_hash=?').bind(tokenHash).run();return null;
 }
 // last_seen is display/operations metadata, not an idle-expiry clock. Avoid a
 // write per API request; the absolute lifetime is still checked on every read.
 const seen=Date.parse(row.last_seen_at);
 if(!Number.isFinite(seen)||seen>now.getTime()||now.getTime()-seen>=SESSION_ACTIVITY_INTERVAL_MS){
  await db.prepare('UPDATE local_sessions SET last_seen_at=? WHERE id_hash=? AND last_seen_at=?').bind(stamp,tokenHash,row.last_seen_at).run();
 }
 return {id:row.id,name:row.name,email:row.email,role:row.role,source:'local' as const,moduleAccess:parseModuleAccess(row.policy_json)};
}
