import { clean, decryptSecret, safeHttpUrl, type IntegrationProvider } from "@/app/api/integrations/security";

type Config = Record<string, string | boolean>;
type JsonRecord = Record<string, unknown>;
type Stored = { provider:string; enabled:number; config_json:string; secret_ciphertext:string|null };

const envText=(env:Record<string,unknown>,key:string)=>String(env[key]??"").trim();
const privateAllowed=(env:Record<string,unknown>)=>["true","1"].includes(envText(env,"FORNOST_ALLOW_PRIVATE_CONNECTORS").toLowerCase());
function endpoint(config:Config,allowPrivate:boolean){const value=safeHttpUrl(config.baseUrl||config.endpoint,allowPrivate);if(!value)throw new Error("Geçerli ve güvenli bir HTTPS adresi gerekli.");return value.replace(/\/+$/,"");}
const basic=(username:string,password:string)=>`Basic ${btoa(`${username}:${password}`)}`;
async function outbound(url:string,init:RequestInit={}){return fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(8_000),headers:{accept:"application/json",...(init.headers||{})}});}
async function parseResponse(response:Response){if((response.headers.get("content-type")||"").includes("application/json")){const parsed=await response.json().catch(()=>({}));return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as JsonRecord:{};}return {message:(await response.text()).slice(0,500)};}
function publicTicket(provider:IntegrationProvider,payload:JsonRecord,config:Config){
  const id=clean(payload.key||payload.number||payload.sys_id||payload.id,120),base=clean(config.baseUrl,1500).replace(/\/+$/,"");let url="";
  if(provider==="jira"&&id)url=`${base}/browse/${encodeURIComponent(id)}`;
  else if(provider==="github-issues"&&payload.html_url)url=safeHttpUrl(payload.html_url)||"";
  else if(provider==="servicenow"&&id)url=`${base}/nav_to.do?uri=incident.do?sys_id=${encodeURIComponent(id)}`;
  else if(provider==="azure-devops"&&id)url=`${base}/_workitems/edit/${encodeURIComponent(id)}`;
  return {id:id||"created",url,status:"created" as const};
}

export async function createTicket(provider:IntegrationProvider,config:Config,secret:string,allowPrivate:boolean,input:JsonRecord){
  const title=clean(input.title,200),description=clean(input.description,4000);if(!title)throw new Error("Ticket başlığı gerekli.");
  const base=endpoint(config,allowPrivate);let url=base,body:unknown;const headers:Record<string,string>={"content-type":"application/json"};
  if(provider==="jira"){url=`${base}/rest/api/3/issue`;headers.authorization=basic(clean(config.username,320),secret);body={fields:{project:{key:clean(config.projectKey,30)},summary:title,description:{type:"doc",version:1,content:[{type:"paragraph",content:[{type:"text",text:description||title}]}]},issuetype:{name:clean(config.issueType,50)||"Task"},labels:["fornost-grc"]}};}
  else if(provider==="servicenow"){url=`${base}/api/now/table/${encodeURIComponent(clean(config.table,50)||"incident")}`;headers.authorization=basic(clean(config.username,320),secret);body={short_description:title,description};}
  else if(provider==="github-issues"){const repo=clean(config.repository,200);if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error("GitHub repository owner/name biçiminde olmalı.");url=`https://api.github.com/repos/${repo}/issues`;headers.authorization=`Bearer ${secret}`;headers["user-agent"]="Fornost-GRC";body={title,body:description,labels:["grc"]};}
  else if(provider==="azure-devops"){const org=clean(config.organization,100),project=clean(config.project,150),type=encodeURIComponent(clean(config.workItemType,80)||"Task");if(!org||!project)throw new Error("Azure DevOps organization ve project gerekli.");url=`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$${type}?api-version=7.1`;headers.authorization=basic("",secret);headers["content-type"]="application/json-patch+json";body=[{op:"add",path:"/fields/System.Title",value:title},{op:"add",path:"/fields/System.Description",value:description||title},{op:"add",path:"/fields/System.Tags",value:"Fornost GRC"}];}
  else if(provider==="webhook"){headers.authorization=`Bearer ${secret}`;body={event:"grc.ticket.create",title,description,sourceId:clean(input.sourceId,120)};}
  else throw new Error("Bu sağlayıcı ticket oluşturmayı desteklemiyor.");
  const response=await outbound(url,{method:"POST",headers,body:JSON.stringify(body)}),payload=await parseResponse(response);if(!response.ok)throw new Error(`Ticket oluşturulamadı (${response.status}).`);return publicTicket(provider,payload,config);
}

export async function createConfiguredTicket(db:D1Database,env:Record<string,unknown>,input:JsonRecord){
  await db.prepare(`CREATE TABLE IF NOT EXISTS integration_settings (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL UNIQUE,provider TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,config_json TEXT NOT NULL DEFAULT '{}',secret_ciphertext TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`).run();
  const row=await db.prepare("SELECT provider,enabled,config_json,secret_ciphertext FROM integration_settings WHERE kind='ticketing'").first<Stored>();if(!row||!row.enabled)throw new Error("Ticket entegrasyonu etkin değil.");
  const key=envText(env,"FORNOST_SETTINGS_ENCRYPTION_KEY"),secret=row.secret_ciphertext?(key?await decryptSecret(row.secret_ciphertext,key):""):"";if(row.secret_ciphertext&&!secret)throw new Error("Ticket entegrasyonu kimlik bilgileri çözülemedi.");
  const provider=row.provider as IntegrationProvider,config=JSON.parse(row.config_json||"{}") as Config;
  return {provider,ticket:await createTicket(provider,config,secret,privateAllowed(env),input)};
}
