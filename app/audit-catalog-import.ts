export type ImportedRequirement = {ref:string;title:string;category:string;statement:string;guidance?:string;assessment?:string};
export type AuditCatalogImport = {name:string;version:string;source:string;rightsConfirmed:boolean;requirements:ImportedRequirement[]};
export const MAX_CATALOG_BYTES=2_000_000;
function str(value:unknown,max:number,required=true):string {
 if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('Invalid catalog field');return value.trim();
}
export function validateCatalogImport(value:unknown,requireRights=true):AuditCatalogImport {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid catalog');
 const v=value as Record<string,unknown>,name=str(v.name,160),version=str(v.version,100),source=str(v.source,1000);
 const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password)throw new Error('HTTPS source required');
 if(requireRights&&v.rightsConfirmed!==true)throw new Error('Content usage rights must be confirmed');
 if(!Array.isArray(v.requirements)||!v.requirements.length||v.requirements.length>2000)throw new Error('Catalog must contain 1–2000 requirements');
 const seen=new Set<string>();
 const requirements=v.requirements.map((raw):ImportedRequirement=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid requirement');const r=raw as Record<string,unknown>;
  const ref=str(r.ref,100);if(seen.has(ref.toLocaleUpperCase('en-US')))throw new Error(`Duplicate reference: ${ref}`);seen.add(ref.toLocaleUpperCase('en-US'));
  return {ref,title:str(r.title,500),category:str(r.category,200),statement:str(r.statement,20000),...(r.guidance!==undefined?{guidance:str(r.guidance,20000,false)}:{}),...(r.assessment!==undefined?{assessment:str(r.assessment,30000,false)}:{})};
 });
 return {name,version,source,rightsConfirmed:v.rightsConfirmed===true,requirements};
}
export async function readCatalogRequest(request:Request):Promise<unknown>{
 if(!request.body)throw new Error('Missing body');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_CATALOG_BYTES){await reader.cancel();throw new Error('Catalog exceeds 2 MB');}chunks.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
