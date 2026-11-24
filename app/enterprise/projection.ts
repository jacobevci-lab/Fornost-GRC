import type {Actor} from '../api/auth/security';
import {canReadModule} from '../module-access';
import {relationFields} from '../connected-grc-model';
import {kinds,sources,sourceSql,recordAccess,type Kind} from './register';
import {exposure} from './fair';

type Node={id:string;recordId:string;kind:Kind;code:string;title:string;status:string;entity:string};
type Internal=Node&{payload:string;estimate:string|null};
// Filtering occurs in SQL before limits. Payloads never leave the server.
async function rows(db:D1Database,user:Actor,kind:Kind,limit:number){
 const src=await sourceSql(db,kind);if(!src)return {rows:[] as Internal[],count:0};
 const a=recordAccess(user),s=sources[kind];
 const core=s.table==='simple_grc_records';
 const payload=core?'r.data_json':kind==='finding'?"json_object('riskRef',r.risk_ref,'controlRef',r.control_ref,'source',r.source_ref)":kind==='incident'?"json_object('assetRefs',r.asset_refs,'riskRef',r.risk_ref,'biaRef',r.bia_ref)":kind==='ai'?"coalesce((SELECT profile_json FROM ai_system_profiles WHERE model_id=r.id),'{}')":"'{}'";
 const q=`${a.cte} SELECT x.id recordId,c.code,x.title,x.status,coalesce(o.org_entity_id,'root') entity,x.estimate,
  ${payload} payload,count(*) OVER() total
  FROM (${src}) x LEFT JOIN org_record_entities o ON o.kind=? AND o.record_id=x.id
  LEFT JOIN simple_grc_record_codes c ON c.record_id=x.registry
  LEFT JOIN ${s.table} r ON ${s.id}=x.id
  WHERE ${a.where} ORDER BY x.id LIMIT ?`;
 const result=(await db.prepare(q).bind(...(a.cte?[user.id]:[]),kind,...(user.orgScope?.selected?[user.orgScope.selected]:[]),limit).all<Omit<Internal,'id'|'kind'>&{total:number}>()).results;
 return {rows:result.map(r=>({...r,id:kind+':'+r.recordId,kind})),count:result[0]?.total||0};
}
export async function financialExposure(db:D1Database,user:Actor){
 if(!canReadModule(user,kinds.risk))return {available:false};
 const result=await rows(db,user,'risk',10001),x=exposure(result.rows.map(row=>({data:{fairLite:row.estimate?JSON.parse(row.estimate):null}})));
 return {available:true,complete:result.rows.length===result.count,total:result.count,measured:x.measured,totals:Object.fromEntries([...x.totals].map(([currency,amount])=>[currency,amount.toString()]))};
}
export async function enterpriseProjection(db:D1Database,user:Actor){
 const counts:Partial<Record<Kind,number>>={},all:Internal[]=[],riskRows:{data:Record<string,unknown>}[]=[];
 let complete=true;
 for(const kind of Object.keys(kinds) as Kind[]){
  if(!canReadModule(user,kinds[kind]))continue;
  const result=await rows(db,user,kind,kind==='risk'?10001:1001);counts[kind]=result.count;
  if(result.rows.length<result.count)complete=false;
  all.push(...result.rows.slice(0,1000));
  if(kind==='risk')for(const row of result.rows)riskRows.push({data:{fairLite:row.estimate?JSON.parse(row.estimate):null}});
 }
 const index=new Map<string,Internal[]>();
 for(const row of all)for(const key of [row.recordId,row.code])if(key){const k=key.toLowerCase();index.set(k,[...(index.get(k)||[]),row]);}
 const edges:{from:string;to:string}[]=[],seen=new Set<string>();
 const referenceKeys=new Set([...Object.keys(relationFields),'riskRef','controlRef','assetRefs','biaRef','source','asset','vendor','risks','controls']);
 const values=(v:unknown):string[]=>Array.isArray(v)?v.flatMap(values):v&&typeof v==='object'?values((v as {id?:unknown}).id):typeof v==='string'?v.split(/[;,|\r\n]+/).map(s=>s.trim().toLowerCase()).filter(Boolean):[];
 for(const row of all){
  const data=JSON.parse(row.payload||'{}');
  for(const [key,value] of Object.entries(data))if(referenceKeys.has(key))for(const ref of values(value)){
   const matches=index.get(ref);if(matches?.length!==1)continue;
   const target=matches[0],key=row.id+'>'+target.id;if(row.id===target.id||seen.has(key))continue;
   seen.add(key);edges.push({from:row.id,to:target.id});
  }
 }
 const financial=exposure(riskRows);
 return {counts,nodes:all.map(({id,recordId,kind,code,title,status,entity})=>({id,recordId,kind,code,title,status,entity})),edges,
  complete:complete&&Object.values(counts).every(n=>n<=1000),
  financial:{totals:Object.fromEntries([...financial.totals].map(([c,n])=>[c,n.toString()])),measured:financial.measured,total:counts.risk??0,complete:riskRows.length===(counts.risk??0)}};
}
