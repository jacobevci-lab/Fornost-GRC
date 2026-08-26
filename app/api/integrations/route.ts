import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { clean, decryptSecret, encryptSecret, safeHttpUrl, safeIntegrationConfig, validProvider, type IntegrationProvider } from "./security";

type Config = Record<string, string | boolean>;
type JsonRecord = Record<string, unknown>;
type Stored = { id:string; kind:string; provider:string; enabled:number; config_json:string; secret_ciphertext:string|null; updated_at:string; updated_by:string };
const kinds = ["ticketing", "email", "identity"] as const;
const providersByKind:Record<(typeof kinds)[number],IntegrationProvider[]>={
  ticketing:["jira","servicenow","azure-devops","github-issues","webhook"],
  email:["smtp-bridge","microsoft-graph-mail","email-api"],
  identity:["entra-oidc","okta-oidc","generic-oidc","saml","ldap","ldaps"],
};

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Record<string, unknown> & { DB:D1Database };
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
function publicTicket(provider:IntegrationProvider, payload:JsonRecord, config:Config) {
  const id=clean(payload.key||payload.number||payload.sys_id||payload.id,120);
  const configuredBase=clean(config.baseUrl,1500).replace(/\/+$/,"");
  let url="";
  if(provider==="jira"&&id)url=`${configuredBase}/browse/${encodeURIComponent(id)}`;
  else if(provider==="github-issues"&&payload.html_url)url=safeHttpUrl(payload.html_url)||"";
  else if(provider==="servicenow"&&id)url=`${configuredBase}/nav_to.do?uri=incident.do?sys_id=${encodeURIComponent(id)}`;
  else if(provider==="azure-devops"&&id)url=`${configuredBase}/_workitems/edit/${encodeURIComponent(id)}`;
  return { id:id||"created", url, status:"created" };
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
  const rows=await DB.prepare("SELECT id,kind,provider,enabled,config_json,updated_at,updated_by,secret_ciphertext IS NOT NULL AS has_secret FROM integration_settings ORDER BY kind").all<Omit<Stored,"secret_ciphertext"> & {config_json:string;has_secret:number}>();
  return json({ integrations:rows.results.map(row=>({...row,enabled:!!row.enabled,config:JSON.parse(row.config_json||"{}"),hasSecret:!!row.has_secret,has_secret:undefined,config_json:undefined})) });
}

export async function PUT(req:NextRequest) {
  const access=await requireRole(req,["Admin"]); if(access.response)return access.response;
  if(bodyTooLarge(req))return json({error:"İstek boyutu çok büyük."},413);
  const body=await req.json().catch(()=>({})),kind=clean(body.kind,30),provider=body.provider;
  if(!kinds.includes(kind as typeof kinds[number])||!validProvider(provider)||!providersByKind[kind as typeof kinds[number]].includes(provider))return json({error:"Geçersiz entegrasyon türü veya sağlayıcı."},400);
  const config=safeIntegrationConfig(body.config),secret=clean(body.secret,4096),enabled=body.enabled===true;
  const env=await runtime(),now=new Date().toISOString(),existing=await getStored(env.DB,kind);
  const key=envText(env,"FORNOST_SETTINGS_ENCRYPTION_KEY");
  if(secret&&!key)return json({error:"Entegrasyon sır anahtarı yapılandırılmamış."},503);
  const encrypted=secret?await encryptSecret(secret,key):existing?.provider===provider?existing.secret_ciphertext:null;
  await env.DB.prepare(`INSERT INTO integration_settings(id,kind,provider,enabled,config_json,secret_ciphertext,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET provider=excluded.provider,enabled=excluded.enabled,config_json=excluded.config_json,secret_ciphertext=excluded.secret_ciphertext,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(existing?.id||crypto.randomUUID(),kind,provider,enabled?1:0,JSON.stringify(config),encrypted,now,access.actor.email).run();
  await event(env.DB,kind,"save",access.actor.email,"success",`${provider} configuration updated`);
  return json({ok:true,hasSecret:!!encrypted});
}

async function testConnection(provider:IntegrationProvider, config:Config, secret:string, allowPrivate:boolean) {
  if(["ldap","ldaps"].includes(provider)){
    const response=await outbound(`${endpoint(config,allowPrivate)}/health`,{headers:{authorization:`Bearer ${secret}`}});
    if(!response.ok)throw new Error(`IAM bridge bağlantısı başarısız (${response.status}).`);
    return {ok:true,message:"LDAP/LDAPS profili ve on-prem IAM bridge bağlantısı doğrulandı."};
  }
  if(["entra-oidc","okta-oidc","generic-oidc"].includes(provider)){
    const issuer=endpoint(config,allowPrivate),response=await outbound(`${issuer}/.well-known/openid-configuration`);
    if(!response.ok)throw new Error(`OIDC discovery başarısız (${response.status}).`);
    const metadata=await parseResponse(response); if(!safeHttpUrl(metadata.authorization_endpoint,allowPrivate))throw new Error("OIDC metadata geçersiz.");
    return {ok:true,message:"OIDC discovery ve issuer doğrulaması başarılı."};
  }
  if(provider==="saml"){
    const response=await outbound(endpoint(config,allowPrivate),{headers:{accept:"application/xml,text/xml"}});
    if(!response.ok)throw new Error(`SAML metadata alınamadı (${response.status}).`);
    const text=(await response.text()).slice(0,100_000); if(!text.includes("EntityDescriptor"))throw new Error("SAML metadata geçersiz.");
    return {ok:true,message:"SAML metadata doğrulandı."};
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

async function createTicket(provider:IntegrationProvider,config:Config,secret:string,allowPrivate:boolean,input:JsonRecord){
  const title=clean(input.title,200),description=clean(input.description,4000); if(!title)throw new Error("Ticket başlığı gerekli.");
  const base=endpoint(config,allowPrivate); let url=base,body:unknown; const headers:Record<string,string>={"content-type":"application/json"};
  if(provider==="jira"){
    url=`${base}/rest/api/3/issue`;headers.authorization=basic(clean(config.username,320),secret);
    body={fields:{project:{key:clean(config.projectKey,30)},summary:title,description:{type:"doc",version:1,content:[{type:"paragraph",content:[{type:"text",text:description||title}]}]},issuetype:{name:clean(config.issueType,50)||"Task"},labels:["fornost-grc"]}};
  }else if(provider==="servicenow"){
    url=`${base}/api/now/table/${encodeURIComponent(clean(config.table,50)||"incident")}`;headers.authorization=basic(clean(config.username,320),secret);body={short_description:title,description};
  }else if(provider==="github-issues"){
    const repo=clean(config.repository,200); if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error("GitHub repository owner/name biçiminde olmalı.");
    url=`https://api.github.com/repos/${repo}/issues`;headers.authorization=`Bearer ${secret}`;headers["user-agent"]="Fornost-GRC";body={title,body:description,labels:["grc"]};
  }else if(provider==="azure-devops"){
    const org=clean(config.organization,100),project=clean(config.project,150),type=encodeURIComponent(clean(config.workItemType,80)||"Task");
    if(!org||!project)throw new Error("Azure DevOps organization ve project gerekli.");
    url=`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$${type}?api-version=7.1`;
    headers.authorization=basic("",secret);headers["content-type"]="application/json-patch+json";
    body=[{op:"add",path:"/fields/System.Title",value:title},{op:"add",path:"/fields/System.Description",value:description||title},{op:"add",path:"/fields/System.Tags",value:"Fornost GRC"}];
  }else if(provider==="webhook"){
    headers.authorization=`Bearer ${secret}`;body={event:"grc.ticket.create",title,description,sourceId:clean(input.sourceId,120)};
  }else throw new Error("Bu sağlayıcı ticket oluşturmayı desteklemiyor.");
  const response=await outbound(url,{method:"POST",headers,body:JSON.stringify(body)}),payload=await parseResponse(response);
  if(!response.ok)throw new Error(`Ticket oluşturulamadı (${response.status}).`);
  return publicTicket(provider,payload,config);
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
  const env=await runtime(),row=await getStored(env.DB,kind); if(!row||!row.enabled)return json({error:"Bu entegrasyon etkin değil."},409);
  const provider=row.provider as IntegrationProvider,config=JSON.parse(row.config_json||"{}") as Config,secret=await credentials(row,env),allowPrivate=privateAllowed(env);
  try{
    const result=action==="test"?await testConnection(provider,config,secret,allowPrivate):action==="create-ticket"?await createTicket(provider,config,secret,allowPrivate,body):action==="send-test"?await sendTest(provider,config,secret,allowPrivate,body):null;
    if(!result)return json({error:"Geçersiz işlem."},400);
    await event(env.DB,kind,action,access.actor.email,"success","message" in result?String(result.message):"completed"); return json(result);
  }catch(error){const message=error instanceof Error?error.message:"Entegrasyon işlemi başarısız.";await event(env.DB,kind,action,access.actor.email,"failed",message);return json({error:message},502)}
}
