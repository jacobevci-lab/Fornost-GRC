import { decryptSecret,encryptSecret } from '../../api/integrations/security';
import { safeAiEndpoint,envFlag,isPrivateHost,isLoopbackHost } from '../security';
import { DEFAULT_AI_DATA_PROTECTION_POLICY,protectAiText } from '../data-protection';
import { type AiMessage,type AiProviderConfig } from '../provider';
import { recordAiEvent } from '../storage';
import { sha256HexBytes } from '../../evidence/versioning';
import { ensureGrcAi } from './schema';
export type Runtime=Record<string,unknown>&{DB:D1Database;BUCKET?:Pick<R2Bucket,'get'>};
export type PrivacyConfig={mode:'offline'|'local'|'byok';provider:'ollama'|'vllm'|'azure'|'bedrock'|'openai'|'openai-compatible';baseUrl:string;model:string;redact:boolean;retentionReference:string;retentionConfirmed:boolean;updatedBy?:string};
type ConfigRow={config:string;secret:string|null;revision:string};
export const defaultPrivacy:PrivacyConfig={mode:'offline',provider:'ollama',baseUrl:'',model:'',redact:true,retentionReference:'',retentionConfirmed:false};
export const digest=(s:string)=>sha256HexBytes(new TextEncoder().encode(s));
export async function privacyRow(db:D1Database){await ensureGrcAi(db);return db.prepare('SELECT * FROM grc_ai_config WHERE id=1').first<ConfigRow>();}
export function validatePrivacy(input:PrivacyConfig,env:Record<string,unknown>){
 if(!['offline','local','byok'].includes(input.mode)||typeof input.redact!=='boolean')throw new Error('AI_CONFIG');
 if(input.mode==='offline')return {...defaultPrivacy,redact:input.redact};
 const normalized=input.provider==='ollama'?input.baseUrl.replace(/\/api\/chat\/?$/,''):input.baseUrl;
 const baseUrl=safeAiEndpoint(normalized,envFlag(env,'FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS'),envFlag(env,'FORNOST_AI_ALLOW_LOOPBACK'));
 if(!baseUrl||!input.model?.trim()||input.model.length>200)throw new Error('AI_ENDPOINT');
 const u=new URL(baseUrl);
 if(input.mode==='local'){
  if(!['ollama','vllm'].includes(input.provider)||(!isPrivateHost(u.hostname)&&!isLoopbackHost(u.hostname)))throw new Error('AI_LOCAL_ONLY');
 }else{
  if(!input.retentionConfirmed||String(input.retentionReference||'').trim().length<10)throw new Error('AI_RETENTION');
  if(u.protocol!=='https:'||u.port&&u.port!=='443')throw new Error('AI_ENDPOINT');
  if(input.provider==='azure'){if(!/^[a-z0-9-]+\.(?:openai\.azure\.com|services\.ai\.azure\.com)$/.test(u.hostname)||u.pathname!=='/openai/v1')throw new Error('AI_AZURE_ENDPOINT');}
  else if(input.provider==='bedrock'){if(!/^bedrock-runtime\.[a-z]{2}(?:-[a-z]+)+-\d\.amazonaws\.com$/.test(u.hostname)||u.pathname!=='/openai/v1')throw new Error('AI_BEDROCK_ENDPOINT');}
  else if(!['openai','openai-compatible'].includes(input.provider)||isPrivateHost(u.hostname)||isLoopbackHost(u.hostname))throw new Error('AI_PROVIDER');
  if(input.provider==='openai'&&(u.hostname!=='api.openai.com'||u.pathname!=='/v1'))throw new Error('AI_ENDPOINT');
 }
 return {mode:input.mode,provider:input.provider,baseUrl,model:input.model.trim(),redact:input.redact,retentionReference:String(input.retentionReference||'').slice(0,1000),retentionConfirmed:input.retentionConfirmed===true};
}
export async function savePrivacy(env:Runtime,input:PrivacyConfig&{secret?:string;revision?:string},actor:string){
 const config={...validatePrivacy(input,env),updatedBy:actor};const old=await privacyRow(env.DB);
 if((old?.revision||'')!==(input.revision||''))throw new Error('AI_STALE');
 const previous:PrivacyConfig=old?JSON.parse(old.config):defaultPrivacy;
 const same=previous.provider===config.provider&&previous.baseUrl===config.baseUrl&&previous.model===config.model;
 const key=String(env.FORNOST_SETTINGS_ENCRYPTION_KEY||'');
 if(input.secret&&(key.length<32||input.secret.length>8192))throw new Error('AI_SECRET');
 const secret=input.secret?await encryptSecret(input.secret,key):same?old?.secret||null:null;
 if(config.mode==='byok'&&!secret)throw new Error('AI_SECRET');
 const revision=crypto.randomUUID();
 const change=old? env.DB.prepare('UPDATE grc_ai_config SET config=?,secret=?,revision=? WHERE id=1 AND revision=?').bind(JSON.stringify(config),secret,revision,old.revision): env.DB.prepare('INSERT OR IGNORE INTO grc_ai_config VALUES(1,?,?,?)').bind(JSON.stringify(config),secret,revision);
 const now=new Date().toISOString();
 const updates=await env.DB.batch([change,env.DB.prepare(`INSERT INTO ai_provider_settings(id,provider,base_url,model,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by) SELECT 'default',?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM grc_ai_config WHERE id=1 AND revision=?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,config_json=excluded.config_json,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(['vllm','openai'].includes(config.provider)?'openai-compatible':config.provider,config.baseUrl,config.model,config.mode==='offline'?0:1,JSON.stringify({trustZone:config.mode==='local'?'private':'external',maxDataClassification:config.mode==='local'?'Confidential':'Internal'}),secret,now,now,actor,revision)]);
 const result=updates[0];
 if(!result.meta?.changes)throw new Error('AI_STALE');
 await recordAiEvent(env.DB,{actor,action:'privacy-config',status:'success',detail:`mode=${config.mode}; redact=${config.redact}; revision=${revision}`});
 return {ok:true,revision};
}
export async function privacyProfile(env:Runtime,row:ConfigRow):Promise<AiProviderConfig|null>{
 const c=validatePrivacy(JSON.parse(row.config),env);if(c.mode==='offline')return null;
 return {provider:(['vllm','openai'].includes(c.provider)?'openai-compatible':c.provider) as AiProviderConfig['provider'],baseUrl:c.baseUrl,model:c.model,apiKey:row.secret?await decryptSecret(row.secret,String(env.FORNOST_SETTINGS_ENCRYPTION_KEY||'')):undefined,temperature:0,timeoutMs:60000,maxTokens:3000};
}
export function protectedMessages(messages:AiMessage[],redact:boolean){return messages.map(m=>({...m,content:protectAiText(m.content.replace(/"(?:password|passwd|secret|api[_-]?key|private[_-]?key|authorization|credentials?|cookie|session|token|access[_-]?token|refresh[_-]?token)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,'"secret":"[REDACTED]"'),{...DEFAULT_AI_DATA_PROTECTION_POLICY,tckn:redact,iban:redact,paymentCard:redact,email:redact,phone:redact},160000).text}));}
export function protectPayload(value:unknown,redact:boolean,depth=0):unknown{
 if(depth>12)return '[OMITTED]';
 if(typeof value==='string')return protectedMessages([{role:'user',content:value}],redact)[0].content;
 if(Array.isArray(value))return value.map(v=>protectPayload(v,redact,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/password|passwd|secret|token|credential|authorization|cookie|private.?key|api.?key/i.test(k)?'[REDACTED]':protectPayload(v,redact,depth+1)]));
 return value;
}
/** Recheck the persisted route immediately before each legacy provider attempt. No cross-boundary fallback. */
export async function guardLegacyRoute(db:D1Database,item:AiProviderConfig,messages:AiMessage[]){
 const row=await privacyRow(db);if(!row)return messages;
 const c:PrivacyConfig=JSON.parse(row.config),provider=['vllm','openai'].includes(c.provider)?'openai-compatible':c.provider;
 if(c.mode==='offline'||provider!==item.provider||c.baseUrl!==item.baseUrl||c.model!==item.model)throw new Error('AI_PRIVACY_ROUTE_BLOCKED');
 return protectedMessages(messages,c.redact);
}
export async function analyzeWithRouter(env:Runtime,actor:string,operation:string,payload:unknown,classification='Internal'){
 const {LLMGateway}=await import('../llm-gateway');
 return (await new LLMGateway(env).analyze(actor,operation,payload,classification)).content;
}
