import {relationFields} from './connected-grc-model';
import {recordCodePrefixes} from './record-codes';

export class CoreReferenceUnavailable extends Error {
 constructor(){super('Yeni bağlantılardan biri bulunamıyor veya hedef modülle eşleşmiyor. Bağlı kayıtları kontrol edin.');}
}
type Reference={sourceId:string;field:string;value:string;modules:string[]};
const prefixes=Object.values(recordCodePrefixes).join('|');
const identity=new RegExp(`^(?:${prefixes})-(?:[0-9]{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`,'i');
const values=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(values):typeof value==='string'?value.split(/[;,|\r\n]+/).map(x=>x.trim().toLowerCase()).filter(Boolean):[];

export const canonicalCoreReferenceValues=(value:unknown)=>[...new Set(values(value))].filter(value=>identity.test(value));

/** Existing unchanged references and legacy free-text labels are preserved. */
export function newCoreReferences(sourceId:string,module:string,data:Record<string,unknown>,before:Record<string,unknown>={}):Reference[]{
 const refs:Reference[]=[];
 for(const [field,rule] of Object.entries(relationFields)){
  if(rule.sources&&!rule.sources.includes(module))continue;
  const modules=rule.modules.filter(target=>target in recordCodePrefixes);
  if(!modules.length)continue;
  const previous=new Set(values(before[field]));
  for(const value of new Set(values(data[field])))if((identity.test(value)||["dependencyRefs","technologyRefs","supplierRefs","vendorEvidenceRefs","controlRiskRefs","supportingEvidenceRefs","sourceAssetRef","sourceVendorRef"].includes(field))&&!previous.has(value))refs.push({sourceId,field,value,modules});
 }
 return refs;
}

/** Evaluated inside the source INSERT/UPDATE, not as an earlier existence check. */
export function coreReferenceGuard(refs:Reference[]){
 if(!refs.length)return{sql:'1',values:[] as string[]};
 return{sql:`NOT EXISTS (
 SELECT 1 FROM json_each(?) ref WHERE (
 SELECT count(*) FROM simple_grc_records target
 WHERE target.id<>json_extract(ref.value,'$.sourceId')
 AND target.module IN (SELECT value FROM json_each(ref.value,'$.modules'))
 AND (lower(target.id)=json_extract(ref.value,'$.value') OR EXISTS (
 SELECT 1 FROM simple_grc_record_codes code WHERE code.record_id=target.id AND lower(code.code)=json_extract(ref.value,'$.value')
 )))<>1)`,values:[JSON.stringify(refs)]};
}

/** Verify directory assignments in the same statement as the core record write. */
export function coreWriteGuard(module:string, records: {id:string;data:Record<string,unknown>;before?:Record<string,unknown>}[]) {
 const guard=coreReferenceGuard(records.flatMap(record=>newCoreReferences(record.id,module,record.data,record.before)));
 if(module==="Kanıtlar"){
  const owners=records.filter(({data,before})=>data.owner!==before?.owner&&String(data.owner||"").includes("@")).map(({data})=>data.owner);
  const reviews=records.filter(({data,before})=>data.reviewer&&(data.reviewer!==before?.reviewer||data.owner!==before?.owner)).map(({data})=>({reviewer:data.reviewer,owner:data.owner}));
  if(owners.length){
   guard.sql+=" AND NOT EXISTS(SELECT 1 FROM json_each(?) o WHERE NOT EXISTS(SELECT 1 FROM local_users WHERE status='Active' AND lower(email)=lower(o.value)))";
   guard.values.push(JSON.stringify(owners));
  }
  if(reviews.length){
   guard.sql+=` AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(
    SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id
    WHERE lower(u.email)=lower(r.value->>'$.reviewer') AND u.status='Active' AND u.role IN ('Admin','Editor')
      AND lower(u.email)<>lower(r.value->>'$.owner') AND lower(u.name)<>lower(r.value->>'$.owner')
      AND (u.role='Admin' OR a.user_id IS NULL OR CASE WHEN json_valid(a.policy_json)
        THEN (json_extract(a.policy_json,'$.mode')='full' OR json_extract(a.policy_json,'$.modules.Kanıtlar')='write') END)))`;
   guard.values.push(JSON.stringify(reviews));
  }
  return guard;
 }
 if(module!=="Risk Assessment" && module!=="Varlık Envanteri" && module!=="BIA" && module!=="Kontroller")return guard;
 const contacts=[];
 const legacyBiaPairs=[];
 for(const {data,before={}} of records){
  const checker=module==="Kontroller"?"testOwner":"approver";
  if((module==="BIA"||module==="Kontroller") && data.owner && data[checker]){
   // Imported BIA rows can identify one person by name and the other by email.
   const owner=String(data.ownerEmail||data.owner).trim(),approver=String(data[checker+"Email"]||data[checker]).trim();
   if(owner.includes("@")!==approver.includes("@"))legacyBiaPairs.push(owner.includes("@")?{email:owner,name:approver}:{email:approver,name:owner});
  }
  for(const field of module==="Risk Assessment"?["owner","actionOwner"]:module==="BIA"?["owner","approver"]:module==="Kontroller"?["owner","evidenceOwner","testOwner"]:["owner"]){
   const emailKey=field+"Email", source=field+"Source";
   if((data[source]!=="directory" && !(["BIA","Kontroller"].includes(module) && data[emailKey])) || (!data[field] && !data[emailKey]))continue;
   if(before[source]===data[source] && before[field]===data[field] && before[emailKey]===data[emailKey])continue;
   contacts.push({name:data[field],email:data[emailKey]});
  }
 }
 if(legacyBiaPairs.length){
  guard.sql+=" AND NOT EXISTS (SELECT 1 FROM json_each(?) pair JOIN local_users u ON lower(u.email)=lower(json_extract(pair.value,'$.email')) AND lower(trim(u.name))=lower(json_extract(pair.value,'$.name')))";
  guard.values.push(JSON.stringify(legacyBiaPairs));
 }
 if(!contacts.length)return guard;
 return {sql:`${guard.sql} AND NOT EXISTS (
   SELECT 1 FROM json_each(?) contact WHERE NOT EXISTS (
    SELECT 1 FROM local_users u WHERE u.status='Active' AND u.email=json_extract(contact.value,'$.email')
    AND coalesce(nullif(u.name,''),u.email)=json_extract(contact.value,'$.name')))`,
   values:[...guard.values,JSON.stringify(contacts)]};
}

export class CoreSideEffectConflict extends Error {}
export async function checkSideConflict(db:D1Database,side?:CoreSideEffect){
 if(side && !(await db.prepare(`SELECT 1 valid WHERE ${side.guard.sql}`).bind(...side.guard.values).first()))throw new CoreSideEffectConflict();
}
export type CoreSideEffect={guard:{sql:string;values:string[]};after:D1PreparedStatement};
export type NewCoreRecord={id:string;code:string;data:Record<string,unknown>};
export type CoreImportClaim={key:string;value:string;guard:{sql:string;values:(string|null)[]}};
export class CoreImportConflict extends Error {}
/** One transaction for the entire import; a rejected reference inserts neither rows nor codes. */
export async function insertCoreRecords(db:D1Database,module:string,records:NewCoreRecord[],now:string,claim?:CoreImportClaim,side?:CoreSideEffect){
 if(!records.length||records.length>1000)throw new Error('Invalid import size');
 const guard=coreWriteGuard(module,records);
 if(side){guard.sql+=' AND ('+side.guard.sql+')';guard.values.push(...side.guard.values)}
 const result=await db.batch([
  db.prepare(`INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at)
 SELECT json_extract(value,'$.id'),?,json_extract(value,'$.data'),?,? FROM json_each(?) WHERE ${guard.sql}${claim?` AND ${claim.guard.sql} AND NOT EXISTS(SELECT 1 FROM simple_grc_metadata WHERE key=?)`:''}`)
   .bind(module,now,now,JSON.stringify(records),...guard.values,...(claim?[...claim.guard.values,claim.key]:[])),
  db.prepare(`INSERT INTO simple_grc_record_codes(record_id,module,code,created_at)
 SELECT json_extract(value,'$.id'),?,json_extract(value,'$.code'),? FROM json_each(?) WHERE changes()=?`)
   .bind(module,now,JSON.stringify(records.map(({id,code})=>({id,code}))),records.length),
  ...(side?[side.after]:[]),
  ...(claim?[db.prepare('INSERT INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,? WHERE changes()=?').bind(claim.key,claim.value,now,records.length)]:[]),
 ]);
 // The code insert is gated by SQLite changes()=records.length, which excludes
 // trigger writes. D1 metadata includes those writes, so its positive receipt
 // confirms the entire import without comparing a trigger-inclusive row count.
 if(claim&&Number(result[2]?.meta?.changes||0)<1)throw new CoreImportConflict();
 if(Number(result[1]?.meta?.changes||0)<1){await checkSideConflict(db,side);throw new CoreReferenceUnavailable();}
}
