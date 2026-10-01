import { connectorProfile, type ConnectorProfile } from './catalog';
import { safeHttpUrl } from '../api/integrations/security';
export class ConnectorError extends Error {constructor(public code:string,message:string){super(`${code}: ${message}`);this.name='ConnectorError';}}
function invalid(message:string):never {throw new ConnectorError('CONFIG_INVALID',message)}
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const crowdOrigins:Record<string,string>={'us-1':'https://api.crowdstrike.com','us-2':'https://api.us-2.crowdstrike.com','eu-1':'https://api.eu-1.crowdstrike.com'};
export function providerConfiguration(body:Record<string,unknown>,allowPrivate=false){
 const p=connectorProfile(body.providerId);if(!p)invalid('Unknown connector profile.');
 const dataset=p.datasets.find(d=>d.id===body.dataset);if(!dataset)invalid('Select a supported dataset.');
 const input=object(body.providerConfig),cfg:Record<string,string>={providerId:p.id,dataset:dataset.id};
 for(const f of p.fields){const value=text(input[f.key]);if(value==='.'||value==='..'||!value||value.length>1024||/[\r\n]/.test(value))invalid(`Required field: ${f.label.en}`);if(f.options&&!f.options.includes(value))invalid(`Invalid ${f.label.en}`);if(['tenantId','clientId','subscriptionId'].includes(f.key)&&p.auth==='microsoft'&&!guid.test(value))invalid(`${f.label.en} must be a GUID.`);cfg[f.key]=value;}
 let origin=p.auth==='crowdstrike'?crowdOrigins[cfg.region]:p.origin;
 if(!origin){const safe=safeHttpUrl(cfg.serviceUrl,allowPrivate);if(!safe)invalid('A permitted HTTPS service URL is required.');const parsed=new URL(safe);if(parsed.search||parsed.hash||parsed.pathname!=='/')invalid('Enter the service origin without a path, query or fragment.');if(p.id==='okta'&&!/^[a-z0-9-]+\.(okta\.com|okta-emea\.com|oktapreview\.com)$/.test(parsed.hostname))invalid('Use the original Okta organisation domain.');origin=parsed.origin;}
 cfg.origin=origin;
 cfg.baseUrl=origin+dataset.path.replace(/\{([^}]+)\}/g,(_,key:string)=>encodeURIComponent(cfg[key]||invalid(`Missing ${key}`)));
 if(!safeHttpUrl(cfg.baseUrl,allowPrivate))invalid('Endpoint is not permitted.');
 return {profile:p,config:cfg};
}
export function providerCredentials(profile:ConnectorProfile,input:unknown):string {
 const supplied=object(input),values:Record<string,string>={};
 const any=profile.secrets.some(f=>text(supplied[f.key]));if(!any)return '';
 for(const f of profile.secrets){const value=text(supplied[f.key]);if(!value||value.length>4096||/[\r\n]/.test(value))invalid(`Required credential: ${f.label.en}`);if(profile.auth==='tenable'&&!/^[a-zA-Z0-9_-]+$/.test(value))invalid('Invalid Tenable key format.');values[f.key]=value;}
 return JSON.stringify(values);
}
export function mayReuseProviderCredentials(previous:Record<string,string>,next:Record<string,string>){return previous.providerId===next.providerId&&previous.origin===next.origin&&previous.tenantId===next.tenantId&&previous.clientId===next.clientId;}

type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
const MAX_BYTES=1_000_000,MAX_PAGES=20;
async function readJson(response:Response,budget:{bytes:number},limit=MAX_BYTES):Promise<unknown>{
 if(response.status===206)throw new ConnectorError('INCOMPLETE_RESPONSE','Provider returned partial data. No evidence was accepted.');
 if(!response.ok){const status=response.status;const code=status===401?'AUTH_FAILED':status===403?'PERMISSION_DENIED':status===429?'RATE_LIMITED':status>=500?'UPSTREAM_UNAVAILABLE':'UPSTREAM_ERROR';const tip=status===401?'Check the credential and its expiry.':status===403?'Check application permissions, consent, resource scope and licence.':status===429?'Provider throttled this request. Retry on the next scheduled run.':'Check the selected product, resource and service availability.';throw new ConnectorError(code,`HTTP ${status}. ${tip}`);}
 if(!(response.headers.get('content-type')||'').toLowerCase().includes('json'))throw new ConnectorError('INVALID_RESPONSE','Expected a JSON response.');
 const reader=response.body?.getReader();if(!reader)throw new ConnectorError('INVALID_RESPONSE','Empty response.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;budget.bytes+=value.byteLength;if(size>limit||budget.bytes>MAX_BYTES){await reader.cancel();throw new ConnectorError('COLLECTION_LIMIT','Response exceeds the collection size limit. Narrow the source scope.');}chunks.push(value);}}catch(error){if(error instanceof ConnectorError)throw error;throw new ConnectorError('TRANSPORT_ERROR','Response stream failed or timed out.');}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new ConnectorError('INVALID_RESPONSE','Malformed JSON.');}
}
/** Tokens remain server-side and are obtained afresh per run; never written to a source config or evidence. */
export async function collectProvider(saved:Record<string,string>,encryptedPlaintext:string,options:{allowPrivate?:boolean;fetcher?:Fetcher}={}){
 const {profile:p,config:cfg}=providerConfiguration({providerId:saved.providerId,dataset:saved.dataset,providerConfig:saved},options.allowPrivate);
 let credentials:Record<string,unknown>;try{credentials=object(JSON.parse(encryptedPlaintext||'{}'));}catch{throw new ConnectorError('AUTH_FAILED','Stored credentials are invalid.');}if(!providerCredentials(p,credentials))invalid('Saved credentials are missing.');
 const fetcher=options.fetcher||fetch,signal=AbortSignal.timeout(30_000),budget={bytes:0};
 const send=async(url:string,init:RequestInit={})=>{
  try{return await fetcher(url,{...init,redirect:'error',signal});}catch{throw new ConnectorError('TRANSPORT_ERROR','Connection failed or timed out. Check HTTPS, network access and certificates.');}
 };
 const headers:Record<string,string>={accept:'application/json','user-agent':'Fornost-GRC-Evidence-Collector/2.0'};
 if(p.auth==='microsoft'||p.auth==='crowdstrike'){
  const tokenUrl=p.auth==='microsoft'?`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`:`${cfg.origin}/oauth2/token`;
  const form=new URLSearchParams({grant_type:'client_credentials',client_id:cfg.clientId,client_secret:text(credentials.clientSecret)});
  if(p.auth==='microsoft')form.set('scope',`${p.id==='defender-endpoint'?'https://api.securitycenter.microsoft.com':cfg.origin}/.default`);
  const token=object(await readJson(await send(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:form.toString()}),{bytes:0},64_000));
  if(typeof token.access_token!=='string'||!token.access_token||/[\r\n]/.test(token.access_token)||token.error)throw new ConnectorError('AUTH_FAILED','Token endpoint did not return a valid access token.');
  headers.authorization=`Bearer ${token.access_token}`;
 }else if(p.auth==='tenable')headers['X-ApiKeys']=`accessKey=${credentials.accessKey};secretKey=${credentials.secretKey}`;
 else if(p.auth==='gitlab')headers['PRIVATE-TOKEN']=text(credentials.token);
 else headers.authorization=`${p.auth==='okta'?'SSWS':'Bearer'} ${credentials.token}`;
 if(p.id==='github'){headers.accept='application/vnd.github+json';headers['X-GitHub-Api-Version']='2022-11-28';}
 const d=p.datasets.find(x=>x.id===cfg.dataset)!;let url=cfg.baseUrl,first:unknown,more=true,pages=0;const items:unknown[]=[];const seen=new Set<string>();
 while(more){
  if(pages>=MAX_PAGES||seen.has(url))throw new ConnectorError('COLLECTION_LIMIT','Pagination is incomplete or repeated. Narrow the source scope.');
  const target=new URL(url),initial=new URL(cfg.baseUrl);
  if(target.origin!==initial.origin||target.pathname!==initial.pathname||target.username||target.password||target.hash)throw new ConnectorError('UNSAFE_PAGINATION','Provider returned an unexpected continuation URL.');
  seen.add(url);pages++;
  const response=await send(url,{method:'GET',headers}),payload=await readJson(response,budget),data=object(payload);
  if(data.error||data.success===false||(Array.isArray(data.errors)&&data.errors.length))throw new ConnectorError('UPSTREAM_ERROR','Provider returned an error envelope. No evidence was accepted.');
  if(first===undefined)first=payload;
  const list=d.root==='$'?payload:data[d.root];
  if(d.pagination!=='none'&&!Array.isArray(list))throw new ConnectorError('INVALID_RESPONSE','Expected the documented collection schema.');
  if(d.pagination==='none'&&(p.id==='tenable'?!Array.isArray(list):!list||typeof list!=='object'||Array.isArray(list)))throw new ConnectorError('INVALID_RESPONSE','Expected the documented dataset.');
  if(Array.isArray(list))items.push(...list);
  let next='';
  if(d.pagination==='odata'||d.pagination==='offset'){next=text(data['@odata.nextLink']||data.nextLink);if(!next&&d.pagination==='offset'&&Array.isArray(list)&&list.length===1000){const u=new URL(url);u.searchParams.set('$skip',String(items.length));next=u.href;}}
  else if(d.pagination==='link')next=(response.headers.get('link')||'').match(/<([^>]+)>;\s*rel="next"/)?.[1]||'';
  else if(d.pagination==='gitlab'){const page=response.headers.get('x-next-page');if(page){if(!/^\d+$/.test(page))throw new ConnectorError('INVALID_RESPONSE','Invalid page number.');const u=new URL(url);u.searchParams.set('page',page);next=u.href;}}
  else if(d.pagination==='cloudflare'){const info=object(data.result_info);if(!Number.isInteger(info.total_pages)||Number(info.total_pages)<0||!Number.isInteger(info.page)||Number(info.page)<1)throw new ConnectorError('INVALID_RESPONSE','Missing pagination metadata.');if(Number(info.page)<Number(info.total_pages)){const u=new URL(url);u.searchParams.set('page',String(Number(info.page)+1));next=u.href;}}
  else if(d.pagination==='crowdstrike'){const page=object(object(data.meta).pagination);if(!Number.isInteger(page.total)||Number(page.total)<0||(!Array.isArray(list))||(list.length===0&&items.length<Number(page.total)))throw new ConnectorError('INVALID_RESPONSE','Missing pagination metadata.');if(items.length<Number(page.total)){const u=new URL(url);u.searchParams.set('offset',String(items.length));next=u.href;}}
  if(next){try{url=new URL(next,cfg.baseUrl).href;}catch{throw new ConnectorError('UNSAFE_PAGINATION','Invalid continuation URL.');}}else more=false;
 }
 // Expose only known response fields from read-only datasets; never auth responses.
 const result:Record<string,unknown>=d.root==='$'?{items}: {...object(first)};
 if(Array.isArray(d.root==='$'?first:object(first)[d.root]))result[d.root==='$'?'items':d.root]=items;
 delete result['@odata.nextLink'];delete result.nextLink;
 result.fornostCollection={providerId:p.id,dataset:d.id,pages,recordCount:d.pagination==='none'&&!Array.isArray(object(first)[d.root])?1:items.length,complete:true,scope:'credential-visible',collectedAt:new Date().toISOString()};
 return result;
}
