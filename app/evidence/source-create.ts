import {ruleCreationRequestId as creationRequestId} from './rule-write';

export type SourceCreationInput={
 id:string;name:string;vendor:string;category:string;driver:string;config_json:string;
 secret_ciphertext:string|null;secret:string;encryptionKey:string;now:string;actor:string;
};
export class SourceCreationConflict extends Error {
 constructor(public sourceId=''){super('Kaynak kayıt isteği mevcut kayıtla çakışıyor. Yeni kaynak oluşturulmadı.');}
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
async function fingerprint(input:SourceCreationInput,requestId:string){
 const value=JSON.stringify(['fornost:source-create:v1',input.actor.toLowerCase(),requestId,input.name,input.vendor,input.category,input.driver,canonical(JSON.parse(input.config_json)),input.secret]);
 const bytes=new TextEncoder().encode(value);
 let digest:ArrayBuffer;
 if(input.secret){
  if(!input.encryptionKey)throw new Error('Entegrasyon şifreleme anahtarı yapılandırılmamış.');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.encryptionKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  digest=await crypto.subtle.sign('HMAC',key,bytes);
 }else digest=await crypto.subtle.digest('SHA-256',bytes);
 return (input.secret?'hmac-v1:':'public-v1:')+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** Replayed creation never updates credentials, test results or linked control history. */
export async function insertEvidenceSource(db:D1Database,input:SourceCreationInput,requestId?:string){
 const key=creationRequestId(requestId),actor=input.actor.toLowerCase();
 const insert=(condition='1',values:string[]=[])=>db.prepare(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,enabled,config_json,secret_ciphertext,created_at,updated_at,updated_by)
 SELECT ?,?,?,?,?,1,?,?,?,?,? WHERE ${condition}`).bind(input.id,input.name,input.vendor,input.category,input.driver,input.config_json,input.secret_ciphertext,input.now,input.now,input.actor,...values);
 if(!key){await insert().run();return {sourceId:input.id,reused:false};}
 const hash=await fingerprint(input,key);
 const read=()=>db.prepare(`SELECT receipt.source_id,receipt.payload_hash,source.id live_id
 FROM evidence_source_creation_requests receipt LEFT JOIN evidence_automation_sources source ON source.id=receipt.source_id
 WHERE receipt.actor=? AND receipt.request_id=?`).bind(actor,key).first<{source_id:string;payload_hash:string;live_id:string|null}>();
 const resolve=(receipt:{source_id:string;payload_hash:string;live_id:string|null},reused:boolean)=>{
  if(receipt.payload_hash!==hash||!receipt.live_id)throw new SourceCreationConflict(receipt.live_id||'');
  return {sourceId:receipt.source_id,reused};
 };
 const existing=await read();if(existing)return resolve(existing,true);
 await db.batch([
  insert('NOT EXISTS(SELECT 1 FROM evidence_source_creation_requests WHERE actor=? AND request_id=?)',[actor,key]),
  db.prepare('INSERT INTO evidence_source_creation_requests(actor,request_id,payload_hash,source_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(actor,key,hash,input.id,input.now),
 ]);
 const saved=await read();if(!saved)throw new Error('Kaynak kaydı doğrulanamadı.');
 return resolve(saved,saved.source_id!==input.id);
}
