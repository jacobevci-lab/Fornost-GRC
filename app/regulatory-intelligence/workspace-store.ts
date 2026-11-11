import {regulatoryCoreTargets} from './domain';
import {commitLifecycle,lifecycleClaim,lifecycleInsert,LifecycleConflict,nextLifecycleStamp} from '../enterprise-lifecycle-write';

type Row=Record<string,unknown>;
type Mappers={source:(row:Row)=>unknown;change:(row:Row)=>unknown;impact:(row:Row)=>unknown};
const active="c.status NOT IN ('closed','not-applicable')";
const changeFrom='regulatory_changes c JOIN regulatory_intelligence_sources s ON s.id=c.source_id';
const impactFrom='regulatory_change_impacts i JOIN regulatory_changes c ON c.id=i.change_id JOIN regulatory_intelligence_sources s ON s.id=c.source_id';
const changeSelect=`c.*,s.name source_name,s.authority,s.url source_url,s.enabled source_enabled,
 (SELECT count(*) FROM regulatory_change_impacts i WHERE i.change_id=c.id) total_impacts,
 (SELECT count(*) FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed') open_impacts,
 (SELECT required_action FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed' ORDER BY i.due_date,i.id LIMIT 1) next_action,
 (SELECT CASE WHEN i.status='verification' THEN c.reviewer ELSE i.action_owner END FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed' ORDER BY i.due_date,i.id LIMIT 1) next_owner,
 (SELECT min(due_date) FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed') next_due`;
const rank=(field:string)=>`CASE ${field} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;
const pageNumber=(v:string|null)=>Math.min(1000000,Math.max(1,Math.trunc(Number(v)||1)));
const limit=20;
const meta=(r:{total:number;page:number;pages:number;pageSize:number})=>({total:r.total,page:r.page,pages:r.pages,pageSize:r.pageSize});
const like=(q:string)=>'%'+q.replace(/[\\%_]/g,'\\$&')+'%';
function search(columns:string[],q:string,where:string[],values:unknown[]){
 if(!q)return;
 where.push('('+columns.map(col=>`lower(replace(${col},'İ','i')) LIKE ? ESCAPE '\\'`).join(' OR ')+')');
 values.push(...columns.map(()=>like(q.toLowerCase().replace(/i\u0307/g,'i'))));
}
async function page(db:D1Database,from:string,columns:string,where:string[],values:unknown[],order:string,requested:number){
 const predicate=where.length?where.join(' AND '):'1';
 const total=Number((await db.prepare(`SELECT count(*) n FROM ${from} WHERE ${predicate}`).bind(...values).first<{n:number}>())?.n||0);
 const pages=Math.max(1,Math.ceil(total/limit)),current=Math.min(requested,pages);
 const rows=(await db.prepare(`SELECT ${columns} FROM ${from} WHERE ${predicate} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values,limit,(current-1)*limit).all<Row>()).results;
 return{rows,total,page:current,pages,pageSize:limit};
}
export async function hasPolicyTable(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='policy_documents'").first();}
export async function policyTargets(db:D1Database,q=''){
 if(!await hasPolicyTable(db))return [];
 return (await db.prepare("SELECT id,code,title FROM policy_documents WHERE status!='retired' AND (title LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\') ORDER BY title,id LIMIT 100").bind(like(q),like(q)).all<{id:string;code:string;title:string}>()).results.map(x=>({id:x.id,module:'Politika Merkezi',title:`${x.code} · ${x.title}`}));
}
export async function readWorkspace(db:D1Database,p:URLSearchParams,email:string,m:Mappers){
 const view=p.get('view')||'overview',q=(p.get('q')||'').trim().slice(0,180),scope=p.get('scope')==='mine'?'mine':'team',filter=p.get('filter')||'all',today=new Date().toISOString().slice(0,10);
 if(p.has('targets')){
  const type=p.get('targets')||'';
  if(type==='policy')return {records:await policyTargets(db,q)};
  const modules=regulatoryCoreTargets[type]||[];
  const r=await page(db,'simple_grc_records r LEFT JOIN simple_grc_record_codes code ON code.record_id=r.id','r.id,r.module,r.data_json,code.code',[`r.module IN (SELECT value FROM json_each(?))`,"(r.data_json LIKE ? ESCAPE '\\' OR r.id LIKE ? ESCAPE '\\' OR code.code LIKE ? ESCAPE '\\')"],[JSON.stringify(modules),like(q),like(q),like(q)],'r.updated_at DESC,r.id',pageNumber(p.get('page')));
  return {...r,records:r.rows.map(x=>{let data:Row={};try{data=JSON.parse(String(x.data_json))}catch{}return{id:x.id,module:x.module,title:[x.code,data.title||data.controlTitle||data.assetName||data.vendor||data.process||data.auditName||data.evidenceTitle||x.id].filter(Boolean).join(' · ')}})};
 }
 if(p.has('detail')){
  const id=(p.get('detail')||'').slice(0,100);
  const change=await db.prepare(`SELECT ${changeSelect} FROM ${changeFrom} WHERE c.id=?`).bind(id).first<Row>();
  const impacts=await page(db,'regulatory_change_impacts i','i.*',['i.change_id=?'],[id],"CASE i.status WHEN 'completed' THEN 1 ELSE 0 END,i.due_date,i.id",pageNumber(p.get('page')));
  const events=(await db.prepare('SELECT id,action,detail,actor,created_at FROM regulatory_change_events WHERE change_id=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(id).all<Row>()).results;
  return{change:change?m.change(change):null,impacts:impacts.rows.map(m.impact),pagination:meta(impacts),events,loadedAt:new Date().toISOString()};
 }
 const summary=await db.prepare(`SELECT
 (SELECT count(*) FROM regulatory_intelligence_sources WHERE enabled=1) sources,
 (SELECT count(*) FROM regulatory_intelligence_sources WHERE enabled=1 AND next_check_at<=?) dueSources,
 (SELECT count(*) FROM regulatory_changes c WHERE ${active}) open,
 (SELECT count(*) FROM regulatory_changes c WHERE ${active} AND applicability='undetermined') unassessed,
 (SELECT count(*) FROM regulatory_change_impacts i JOIN regulatory_changes c ON c.id=i.change_id WHERE ${active} AND i.status!='completed' AND i.due_date<?) overdueImpacts,
 (SELECT count(*) FROM regulatory_change_impacts i JOIN regulatory_changes c ON c.id=i.change_id WHERE ${active} AND i.status='verification') verification`).bind(new Date().toISOString(),today).first();
 const where:string[]=[],values:unknown[]=[];
 if(view==='sources'){
  if(filter==='archived')where.push('s.enabled=0');else if(filter!=='all-sources')where.push('s.enabled=1');
  if(filter==='due'){where.push('s.next_check_at<=?');values.push(new Date().toISOString());}
  search(['s.name','s.authority','s.owner','s.jurisdiction'],q,where,values);
  const r=await page(db,'regulatory_intelligence_sources s','s.*,(SELECT count(*) FROM regulatory_changes c WHERE c.source_id=s.id) change_count',where,values,'s.enabled DESC,s.next_check_at,s.id',pageNumber(p.get('page')));
  return{sources:r.rows.map(m.source),changes:[],impacts:[],summary,pagination:meta(r),loadedAt:new Date().toISOString()};
 }
 if(view==='impacts'){
  if(p.get('focusId')){where.push('i.id=?');values.push(p.get('focusId'));}
  else {
   if(filter==='completed')where.push("i.status='completed'");else if(filter!=='all-statuses')where.push(active,"i.status!='completed'");
   if(scope==='mine'){where.push("(i.action_owner=? OR (i.status='verification' AND c.reviewer=?))");values.push(email,email);}
   if(filter==='overdue'){where.push("i.status!='completed' AND i.due_date<?");values.push(today);}
   if(filter==='verification')where.push("i.status='verification'");
   if(['high','critical'].includes(filter)){where.push('i.impact_level=?');values.push(filter);}
   search(['i.target_title','i.target_ref','i.required_action','i.action_owner','c.title','c.external_ref'],q,where,values);
  }
  const r=await page(db,impactFrom,'i.*,c.title change_title,c.reviewer,c.status parent_status',where,values,`CASE WHEN i.status!='completed' AND i.due_date<'${today}' THEN 0 ELSE 1 END,${rank('i.impact_level')},i.due_date,i.id`,pageNumber(p.get('page')));
  return{sources:[],changes:[],impacts:r.rows.map(x=>({...m.impact(x) as Row,changeTitle:x.change_title,reviewer:x.reviewer,parentStatus:x.parent_status})),summary,pagination:meta(r),loadedAt:new Date().toISOString()};
 }
 if(p.get('focusId')){where.push('c.id=?');values.push(p.get('focusId'));}
 else {
  if(filter==='closed')where.push("c.status IN ('closed','not-applicable')");else if(view==='overview'||filter!=='all-statuses')where.push(active);
  if(scope==='mine'){where.push("(c.owner=? OR c.reviewer=? OR EXISTS(SELECT 1 FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.action_owner=? AND i.status!='completed'))");values.push(email,email,email);}
  if(filter==='unassessed')where.push("c.applicability='undetermined'");
  if(filter==='overdue'){where.push("EXISTS(SELECT 1 FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed' AND i.due_date<?)");values.push(today);}
  if(filter==='verification')where.push("c.status='verification' OR EXISTS(SELECT 1 FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status='verification')");
  if(['high','critical'].includes(filter)){where.push('c.severity=?');values.push(filter);}
  search(['c.title','c.external_ref','c.owner','c.reviewer','s.name','s.authority'],q,where,values);
 }
 const r=await page(db,changeFrom,changeSelect,where.map(x=>`(${x})`),values,`CASE WHEN EXISTS(SELECT 1 FROM regulatory_change_impacts i WHERE i.change_id=c.id AND i.status!='completed' AND i.due_date<'${today}') THEN 0 ELSE 1 END,${rank('c.severity')},COALESCE(next_due,c.effective_date),c.id`,pageNumber(p.get('page')));
 return{sources:[],changes:r.rows.map(m.change),impacts:[],summary,pagination:meta(r),loadedAt:new Date().toISOString()};
}

/** Source mutations retain event history and protect the exact reviewed version. */
export async function mutateSource(db:D1Database,input:Row,email:string,value?:ReturnType<typeof import('./domain').validateRegulatorySource>,url?:string,assignment={sql:'1',values:[] as unknown[]}){
 const id=String(input.sourceId||''),operation=String(input.action),source=await db.prepare('SELECT * FROM regulatory_intelligence_sources WHERE id=?').bind(id).first<Record<string,string|number|null>>();
 if(!source||!input.expectedUpdatedAt||source.updated_at!==input.expectedUpdatedAt)throw new LifecycleConflict();
 const now=nextLifecycleStamp(source.updated_at);
 const guard=operation==='delete-source'?{sql:'NOT EXISTS(SELECT 1 FROM regulatory_changes WHERE source_id=?)',values:[id]}:assignment;
 const claim=operation==='delete-source'
  ?db.prepare(`DELETE FROM regulatory_intelligence_sources WHERE ${Object.keys(source).map(key=>`${key} IS ?`).join(" AND ")} AND ${guard.sql}`).bind(...Object.values(source),...guard.values)
  :operation==='update-source'&&value&&url
   ?lifecycleClaim(db,'regulatory_intelligence_sources','name=?,authority=?,jurisdiction=?,source_type=?,url=?,owner=?,review_frequency_days=?,next_check_at=?,updated_by=?,updated_at=?',[value.name,value.authority,value.jurisdiction,value.sourceType,url,value.owner,value.reviewFrequencyDays,new Date(new Date(String(source.last_checked_at||source.created_at)).getTime()+value.reviewFrequencyDays*86400000).toISOString(),email,now],source,guard)
   :lifecycleClaim(db,'regulatory_intelligence_sources','enabled=?,updated_by=?,updated_at=?',[operation==='restore-source'?1:0,email,now],source);
 if(operation==='delete-source'&&await db.prepare('SELECT 1 FROM regulatory_changes WHERE source_id=? LIMIT 1').bind(id).first())throw new Error('Bağlı değişiklikler var. Kaynağı silmek yerine arşivleyin. / Linked changes exist. Archive the source.');
 await commitLifecycle(db,claim,[lifecycleInsert(db,'regulatory_change_events',{id:crypto.randomUUID(),source_id:id,action:operation,detail:`${source.authority} · ${source.name}${value?` → ${value.authority} · ${value.name}`:''}`,actor:email,created_at:now})]);
}
