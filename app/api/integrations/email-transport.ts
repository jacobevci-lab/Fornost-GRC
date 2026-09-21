import {clean,decryptSecret,safeHttpUrl,type IntegrationProvider} from "./security";

type Env=Record<string,unknown>;
type Config=Record<string,string|boolean>;
type Stored={provider:string;enabled:number;config_json:string;secret_ciphertext:string|null};
export type EmailDeliveryInput={to:string;subject:string;text:string};
export type EmailDeliveryResult={sent:boolean;state:"sent"|"failed"|"not-configured";provider:string;detail:string};

const envText=(env:Env,key:string)=>String(env[key]??"").trim();
const privateAllowed=(env:Env)=>["true","1"].includes(envText(env,"FORNOST_ALLOW_PRIVATE_CONNECTORS").toLowerCase());
const endpoint=(config:Config,allowPrivate:boolean)=>{
 const url=safeHttpUrl(config.baseUrl||config.endpoint||config.bridgeUrl,allowPrivate);if(!url)throw new Error("E-posta entegrasyon endpoint'i geçersiz.");return url.replace(/\/+$/,"");
};
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function deliverConfiguredEmail(db:D1Database,env:Env,input:EmailDeliveryInput):Promise<EmailDeliveryResult>{
 const to=clean(input.to,320),subject=clean(input.subject,240),text=clean(input.text,8000);if(!validEmail(to)||!subject||!text)return{sent:false,state:"failed",provider:"",detail:"Geçerli alıcı, konu ve içerik gerekli."};
 let row:Stored|null=null;try{row=await db.prepare("SELECT provider,enabled,config_json,secret_ciphertext FROM integration_settings WHERE kind='email'").first<Stored>()}catch{return{sent:false,state:"not-configured",provider:"",detail:"E-posta entegrasyonu yapılandırılmamış."}}
 if(!row||!row.enabled)return{sent:false,state:"not-configured",provider:row?.provider||"",detail:"E-posta entegrasyonu etkin değil."};
 const provider=row.provider as IntegrationProvider;if(!["smtp-bridge","microsoft-graph-mail","email-api"].includes(provider))return{sent:false,state:"failed",provider,detail:"Desteklenmeyen e-posta sağlayıcısı."};
 let config:Config={};try{config=JSON.parse(row.config_json||"{}") as Config}catch{}
 const key=envText(env,"FORNOST_SETTINGS_ENCRYPTION_KEY");if(row.secret_ciphertext&&!key)return{sent:false,state:"failed",provider,detail:"Entegrasyon sır anahtarı yapılandırılmamış."};
 let secret="";try{secret=await decryptSecret(row.secret_ciphertext,key)}catch{return{sent:false,state:"failed",provider,detail:"E-posta entegrasyon sırrı çözülemedi."}}
 const headers:Record<string,string>={"content-type":"application/json","accept":"application/json"};let url="",body:unknown;
 try{
  if(provider==="microsoft-graph-mail"){
   const sender=clean(config.sender,320);if(!sender)return{sent:false,state:"failed",provider,detail:"Graph sender yapılandırılmamış."};url=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;headers.authorization=`Bearer ${secret}`;body={message:{subject,body:{contentType:"Text",content:text},toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true};
  }else if(provider==="smtp-bridge"){
   url=endpoint(config,privateAllowed(env));headers.authorization=`Bearer ${secret}`;body={host:clean(config.smtpHost,320),port:Number(config.smtpPort||587),secure:config.secure===true,username:clean(config.username,320),password:secret,from:clean(config.sender,320),to,subject,text};
  }else{
   url=endpoint(config,privateAllowed(env));headers.authorization=`Bearer ${secret}`;body={from:clean(config.sender,320),to,subject,text};
  }
  const response=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(8_000),headers,body:JSON.stringify(body)});if(!response.ok)return{sent:false,state:"failed",provider,detail:`E-posta transport HTTP ${response.status}.`};return{sent:true,state:"sent",provider,detail:`${provider} transport accepted message.`};
 }catch(error){return{sent:false,state:"failed",provider,detail:error instanceof Error?clean(error.message,300):"E-posta transport hatası."}}
}
