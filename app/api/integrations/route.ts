import { createTicket } from "../../integrations/ticketing";
import { testTicketConnection } from "../../integrations/ticketing-test";
import { ticketConfigError } from "../../integrations/ticketing-config";
import { applicationLinkBase } from '../../record-links';
import { completedInitialization } from "../../completed-initialization";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { clean, decryptSecret, encryptSecret, safeHttpUrl, safeIntegrationConfig, validProvider, type IntegrationProvider } from "./security";

type Config = Record<string, string | boolean>;
type JsonRecord = Record<string, unknown>;
type Stored = { id:string; kind:string; provider:string; enabled:number; config_json:string; secret_ciphertext:string|null; updated_at:string; updated_by:string };
const kinds = ["ticketing", "email", "identity"] as const;
const providersByKind:Record<(typeof kinds)[number],IntegrationProvider[]>={
  ticketing:["jira","jira-dc","servicenow","azure-devops","github-issues","webhook"],
  email:["smtp-bridge","microsoft-graph-mail","email-api"],
  identity:["entra-oidc","okta-oidc","generic-oidc","saml","ldap","ldaps"],
};

const integrationSchema = [
  `CREATE TABLE IF NOT EXISTS integration_settings (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    secret_ciphertext TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS integration_settings_kind_idx ON integration_settings(kind)`,
  `CREATE TABLE IF NOT EXISTS integration_events (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS integration_events_kind_created_idx ON integration_events(kind, created_at)`,
];
const initializeIntegrations=completedInitialization();

async function runtime() {
  const { env } = await import("cloudflare:workers");
  const result=env as unknown as Record<string, unknown> & { DB:D1Database };
  await initializeIntegrations(result.DB,()=>result.DB.batch(integrationSchema.map(sql=>result.DB.prepare(sql))));
  return result;
}

function envText(env: Record<string, unknown>, key: string) { return String(env[key] ?? "").trim(); }
function privateAllowed(env: Record<string, unknown>) { return ["true", "1"].includes(envText(env, "FORNOST_ALLOW_PRIVATE_CONNECTORS").toLowerCase()); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } }); }
function bodyTooLarge(req: NextRequest) { return Number(req.headers.get("content-length") || 0) > 65_536; }
function endpoint(config: Config, allowPrivate: boolean) {
  const value = safeHttpUrl(config.baseUrl || config.endpoint || config.issuer || config.metadataUrl || config.bridgeUrl, allowPrivate);
  if (!value) throw new Error("Geçerli ve güvenli bir HTTPS adresi gerekli.");
  return value.replace(/\/+$/, "");
}
function basic(username:string, password:string) { return `Basic ${btoa(`${username}:${password}`)}`; }
function timeoutSignal() { return AbortSignal.timeout(8_000); }
async function outbound(url:string, init:RequestInit={}) {
  return fetch(url, { ...init, redirect:"error", signal:timeoutSignal(), headers:{ "accept":"application/json", ...(init.headers||{}) } });
}
async function parseResponse(response:Response) {
  const contentType=response.headers.get("content-type")||"";
  if(contentType.includes("application/json")){
    const parsed=await response.json().catch(()=>({}));
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as JsonRecord:{};
  }
  return { message:(await response.text()).slice(0,500) };
}
async function getStored(db:D1Database, kind:string) {
  return db.prepare("SELECT * FROM integration_settings WHERE kind=?").bind(kind).first<Stored>();
}
async function credentials(row:Stored, env:Record<string,unknown>) {
  if(!row.secret_ciphertext)return "";
  const key=envText(env,"FORNOST_SETTINGS_ENCRYPTION_KEY");
  if(!key)throw new Error("Entegrasyon sır anahtarı yapılandırılmamış.");
  return decryptSecret(row.secret_ciphertext,key);
}
async function event(db:D1Database, kind:string, action:string, actor:string, status:string, detail:string) {
  await db.prepare("INSERT INTO integration_events(id,kind,action,status,detail,actor,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),kind,action,status,clean(detail,500),actor,new Date().toISOString()).run();
}

export async function GET(req:NextRequest) {
  const access=await requireRole(req,["Admin"]); if(access.response)return access.response;
  const { DB }=await runtime();
  if(new URL(req.url).searchParams.get("view")==="history") {
    const events=await DB.prepare("SELECT id,action,status,detail,actor,created_at FROM integration_events WHERE kind='ticketing' ORDER BY created_at DESC,id DESC LIMIT 100").all();
    return json({events:events.results,limit:100});
  }
  const rows=await DB.prepare("SELECT id,kind,provider,enabled,config_json,updated_at,updated_by,secret_ciphertext IS NOT NULL AS has_secret FROM integration_settings ORDER BY kind").all<Omit<Stored,"secret_ciphertext"> & {config_json:string;has_secret:number}>();
  return json({ integrations:rows.results.map(row=>({...row,enabled:!!row.enabled,config:JSON.parse(row.config_json||"{}"),hasSecret:!!row.has_secret,has_secret:undefined,config_json:undefined})) });
}

export async function PUT(req:NextRequest) {
  const access=await requireRole(req,["Admin"]); if(access.response)return access.response;
  if(bodyTooLarge(req))return json({error:"İstek boyutu çok büyük."},413);
  const body=await req.json().catch(()=>({})),kind=clean(body.kind,30),provider=body.provider;
  if(!kinds.includes(kind as typeof kinds[number])||!validProvider(provider)||!providersByKind[kind as typeof kinds[number]].includes(provider))return json({error:"Geçersiz entegrasyon türü veya sağlayıcı."},400);
  if(kind==='email' && body.config?.applicationUrl !== undefined && body.config.applicationUrl !== '' && !applicationLinkBase(body.config.applicationUrl)) return json({error:'Uygulama adresi HTTPS olmalı; kullanıcı bilgisi, sorgu veya fragment içermemeli. / Application URL must use HTTPS without credentials, query or fragment.'},400);
  const config=safeIntegrationConfig(body.config),secret=clean(body.secret,4096),enabled=body.enabled===true;
  const env=await runtime(),now=new Date().toISOString(),existing=await getStored(env.DB,kind);
  if(body.expectedUpdatedAt!==undefined&&body.expectedUpdatedAt!==(existing?.updated_at||""))return json({error:"Bağlantı değişti. Yenileyin / Connection changed. Refresh before saving."},409);
  const key=envText(env,"FORNOST_SETTINGS_ENCRYPTION_KEY");
  if(secret&&!key)return json({error:"Entegrasyon sır anahtarı yapılandırılmamış."},503);
  const encrypted=secret?await encryptSecret(secret,key):existing?.provider===provider?existing.secret_ciphertext:null;
  if(kind==="ticketing"&&enabled){const invalid=ticketConfigError(provider,config,Boolean(encrypted),true,privateAllowed(env));if(invalid)return json({error:invalid},422);}
  const serialized=JSON.stringify(config);
  const changed=!existing||existing.provider!==provider||existing.config_json!==serialized||Boolean(secret);
  const action=changed?"save":enabled?"enable":"pause";
  const updatedAt=existing&&now<=existing.updated_at?new Date(Date.parse(existing.updated_at)+1).toISOString():now;
  const write=existing
    ? env.DB.prepare("UPDATE integration_settings SET provider=?,enabled=?,config_json=?,secret_ciphertext=?,updated_at=?,updated_by=? WHERE id=? AND updated_at=?")
      .bind(provider,enabled?1:0,serialized,encrypted,updatedAt,access.actor.email,existing.id,existing.updated_at)
    : env.DB.prepare("INSERT OR IGNORE INTO integration_settings(id,kind,provider,enabled,config_json,secret_ciphertext,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),kind,provider,enabled?1:0,serialized,encrypted,updatedAt,access.actor.email);
  const [result]=await env.DB.batch([write,env.DB.prepare("INSERT INTO integration_events(id,kind,action,status,detail,actor,created_at) SELECT ?,?,?,'success',?,?,? WHERE changes()>0").bind(crypto.randomUUID(),kind,action,`${provider} configuration updated`,access.actor.email,updatedAt)]);
  if(!result.meta?.changes)return json({error:"Bağlantı değişti. Yenileyin / Connection changed. Refresh before saving."},409);
  return json({ok:true,hasSecret:!!encrypted,updatedAt});
}

export async function DELETE(req:NextRequest) {
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const body=bodyTooLarge(req)?{}:await req.json().catch(()=>({}));
  if(body.kind!=="ticketing"||typeof body.expectedUpdatedAt!=="string")return json({error:"Geçersiz bağlantı / Invalid connection."},400);
  const {DB}=await runtime();
  const row=await getStored(DB,"ticketing");
  if(!row||row.updated_at!==body.expectedUpdatedAt)return json({error:"Bağlantı değişti. Yenileyin / Connection changed. Refresh before disconnecting."},409);
  const results=await DB.batch([
    DB.prepare("INSERT INTO integration_events(id,kind,action,status,detail,actor,created_at) SELECT ?,'ticketing','disconnect','success','Connection removed; external work and history retained',?,? FROM integration_settings WHERE id=? AND updated_at=?")
      .bind(crypto.randomUUID(),access.actor.email,new Date().toISOString(),row.id,row.updated_at),
    DB.prepare("DELETE FROM integration_settings WHERE id=? AND updated_at=?").bind(row.id,row.updated_at),
  ]);
  if(!results[1].meta?.changes)return json({error:"Bağlantı değişti. Yenileyin / Connection changed. Refresh before disconnecting."},409);
  return json({ok:true});
}

async function testConnection(provider:IntegrationProvider, config:Config, secret:string, allowPrivate:boolean) {
  if(providersByKind.ticketing.includes(provider))return testTicketConnection(provider,config,secret,allowPrivate);
  if(["ldap","ldaps"].includes(provider)){
    const response=await outbound(`${endpoint(config,allowPrivate)}/health`,{headers:{authorization:`Bearer ${secret}`}});
    if(!response.ok)throw new Error(`IAM bridge bağlantısı başarısız (${response.status}).`);
    return {ok:true,message:"IAM bridge sağlık kontrolü geçti. LDAP bind ve kullanıcı girişi doğrulanmadı. / Bridge health check passed; LDAP bind and sign-in are unverified."};
  }
  if(["entra-oidc","okta-oidc","generic-oidc"].includes(provider)){
    const issuer=endpoint(config,allowPrivate),response=await outbound(`${issuer}/.well-known/openid-configuration`);
    if(!response.ok)throw new Error(`OIDC discovery başarısız (${response.status}).`);
    const metadata=await parseResponse(response); if(!safeHttpUrl(metadata.authorization_endpoint,allowPrivate))throw new Error("OIDC metadata geçersiz.");
    return {ok:true,message:"OIDC discovery belgesi ve authorization_endpoint alanı okunabildi. Kullanıcı girişi doğrulanmadı. / Discovery preflight passed; sign-in is unverified."};
  }
  if(provider==="saml"){
    const response=await outbound(endpoint(config,allowPrivate),{headers:{accept:"application/xml,text/xml"}});
    if(!response.ok)throw new Error(`SAML metadata alınamadı (${response.status}).`);
    const text=(await response.text()).slice(0,100_000); if(!text.includes("EntityDescriptor"))throw new Error("SAML metadata geçersiz.");
    return {ok:true,message:"SAML belgesi alındı ve EntityDescriptor işareti bulundu. İmza ve kullanıcı girişi doğrulanmadı. / Metadata marker found; signature and sign-in are unverified."};
  }
  const base=endpoint(config,allowPrivate); let url=base; const headers:Record<string,string>={};
  if(provider==="jira"){url=`${base}/rest/api/3/myself`;headers.authorization=basic(clean(config.username,320),secret)}
  else if(provider==="servicenow"){url=`${base}/api/now/table/sys_user?sysparm_limit=1`;headers.authorization=basic(clean(config.username,320),secret)}
  else if(provider==="github-issues"){url="https://api.github.com/user";headers.authorization=`Bearer ${secret}`;headers["user-agent"]="Fornost-GRC"}
  else if(provider==="azure-devops"){url=`${base}/_apis/projects?api-version=7.1`;headers.authorization=basic("",secret)}
  else if(provider==="microsoft-graph-mail"){url="https://graph.microsoft.com/v1.0/me";headers.authorization=`Bearer ${secret}`}
  else if(["webhook","smtp-bridge","email-api"].includes(provider)){headers.authorization=`Bearer ${secret}`}
  const response=await outbound(url,{headers}); if(!response.ok)throw new Error(`Bağlantı testi başarısız (${response.status}).`);
  return {ok:true,message:"Bağlantı testi başarılı."};
}

async function sendTest(provider:IntegrationProvider,config:Config,secret:string,allowPrivate:boolean,input:JsonRecord){
  const to=clean(input.to,320); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw new Error("Geçerli test alıcısı gerekli.");
  const subject="Fornost GRC bağlantı testi",content="Fornost GRC e-posta entegrasyonu başarıyla çalışıyor.";
  let url=endpoint(config,allowPrivate),body:unknown; const headers:Record<string,string>={"content-type":"application/json","authorization":`Bearer ${secret}`};
  if(provider==="microsoft-graph-mail"){
    const sender=encodeURIComponent(clean(config.sender,320)); if(!sender)throw new Error("Graph sender gerekli.");
    url=`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`;body={message:{subject,body:{contentType:"Text",content},toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true};
  }else if(provider==="smtp-bridge")body={host:clean(config.smtpHost,320),port:Number(config.smtpPort||587),secure:config.secure===true,username:clean(config.username,320),password:secret,from:clean(config.sender,320),to,subject,text:content};
  else if(provider==="email-api")body={from:clean(config.sender,320),to,subject,text:content};
  else throw new Error("Bu e-posta sağlayıcısı test gönderimini desteklemiyor.");
  const response=await outbound(url,{method:"POST",headers,body:JSON.stringify(body)}); if(!response.ok)throw new Error(`Test e-postası gönderilemedi (${response.status}).`);
  return {ok:true,message:`Test e-postası ${to} adresine gönderildi.`};
}

export async function POST(req:NextRequest) {
  const body=bodyTooLarge(req)?{}:await req.json().catch(()=>({})),action=clean(body.action,40),kind=clean(body.kind,30);
  const roles=action==="create-ticket"?["Admin","Editor"] as const:["Admin"] as const;
  const access=await requireRole(req,[...roles]); if(access.response)return access.response;
  if(bodyTooLarge(req))return json({error:"İstek boyutu çok büyük."},413);
  if(!kinds.includes(kind as typeof kinds[number]))return json({error:"Geçersiz entegrasyon türü."},400);
  const env=await runtime(),row=await getStored(env.DB,kind); if(!row||(!row.enabled&&action!=="test"))return json({error:"Bu entegrasyon etkin değil."},409);
  if(body.expectedUpdatedAt!==undefined&&body.expectedUpdatedAt!==row.updated_at)return json({error:"Bağlantı değişti. Yenileyin / Connection changed. Refresh before continuing."},409);
  const provider=row.provider as IntegrationProvider,config=JSON.parse(row.config_json||"{}") as Config,secret=await credentials(row,env),allowPrivate=privateAllowed(env);
  try{
    const result=action==="test"?await testConnection(provider,config,secret,allowPrivate):action==="create-ticket"?await createTicket(provider,config,secret,allowPrivate,body):action==="send-test"?await sendTest(provider,config,secret,allowPrivate,body):null;
    if(!result)return json({error:"Geçersiz işlem."},400);
    if(action==="test"){
      const saved=await testEvent(env.DB,row,access.actor.email,"success","message" in result?String(result.message):"completed");
      if(!saved)return json({error:"Test sırasında bağlantı değişti. Yeniden test edin / Connection changed during the test. Test again."},409);
    }else await event(env.DB,kind,action,access.actor.email,"success","message" in result?String(result.message):"completed");
    return json(result);
  }catch(error){const message=error instanceof Error?error.message:"Entegrasyon işlemi başarısız.";if(action==="test")await testEvent(env.DB,row,access.actor.email,"failed",message);else await event(env.DB,kind,action,access.actor.email,"failed",message);return json({error:message},502)}
}

async function testEvent(db:D1Database,row:Stored,actor:string,status:string,detail:string){
 const result=await db.prepare("INSERT INTO integration_events(id,kind,action,status,detail,actor,created_at) SELECT ?,?,'test',?,?,?,? FROM integration_settings WHERE id=? AND updated_at=?")
   .bind(crypto.randomUUID(),row.kind,status,clean(detail,500),actor,new Date().toISOString(),row.id,row.updated_at).run();
 return Boolean(result.meta?.changes);
}
