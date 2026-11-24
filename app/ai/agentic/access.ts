import type { Actor } from '../../api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from '../../module-access';
import { resolveScope } from '../../enterprise/scope';
import { checkAiAccess } from '../operating-policy';
import { AgenticError } from './common';
export async function agentActor(db:D1Database,actor:Actor,write=false){
 const u=await db.prepare('SELECT u.id,u.email,u.name,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id).first<{id:string;email:string;name:string;role:Actor['role'];status:string;policy_json:string|null}>();
 if(!u||u.status!=='Active'||u.email.toLowerCase()!==actor.email.toLowerCase()||write&&!['Admin','Editor'].includes(u.role))throw new AgenticError('AI_SCOPE',403);
 const live:Actor={id:u.id,email:u.email,name:u.name,role:u.role,source:actor.source,moduleAccess:parseModuleAccess(u.policy_json)};
 live.orgScope=await resolveScope(db,live,actor.orgScope?.selected||undefined);
 if(!(await checkAiAccess(db,live.role,write?'agents':'chat')).allowed||write&&!(await checkAiAccess(db,live.role,'drafts')).allowed)throw new AgenticError('AI_OPERATION_BLOCKED',403);
 return live;
}
export const requireModule=(actor:Actor,module:string,write=false)=>{if(!(write?canWriteModule(actor,module):canReadModule(actor,module)))throw new AgenticError('AI_SCOPE',403);};
export {entityIds,authoritySql,authority,authorityGuard} from '../../enterprise/access';
