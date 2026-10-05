/** Exact navigation reads remain independent of the bounded list projection. */
export function aiRecordQueryId(params:URLSearchParams,key:'id'|'modelId'='id'):string|null {
  const ids=params.getAll(key);
  if(!ids.length)return null;
  const id=ids[0];
  if(ids.length!==1||!id||id!==id.trim()||id.length>100||/[\u0000-\u001f\u007f]/.test(id))throw new Error('Geçerli bir kayıt kimliği gereklidir.');
  return id;
}
export type AiWorkState='all'|'open'|'closed';
export function aiWorkStateQuery(params:URLSearchParams):AiWorkState {
  const states=params.getAll('workState');
  if(!states.length)return 'all';
  if(states.length!==1||!['all','open','closed'].includes(states[0]))throw new Error('Geçerli bir aksiyon durumu gereklidir.');
  return states[0] as AiWorkState;
}
const sources={
  models:{table:'ai_model_inventory',order:"CASE risk_tier WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,review_date"},
  alerts:{table:'ai_assurance_alerts',order:"CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,last_seen_at DESC"},
  findings:{table:'ai_findings',order:"CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,due_date,updated_at DESC"},
} as const;
export function readAiRecords(db:D1Database,kind:keyof typeof sources,id:string|null,modelId:string|null=null,workState:AiWorkState='all'){
  const source=sources[kind];
  if((modelId!==null||workState!=='all')&&kind==='models')throw new Error('Model filter requires a child record source');
  const conditions:string[]=[],values:string[]=[];
  if(id!==null){conditions.push('id=?');values.push(id);}
  if(modelId!==null){conditions.push('model_id=?');values.push(modelId);}
  if(workState!=='all'){
    const terminal=kind==='findings'?"('resolved','dismissed')":"('resolved')";
    conditions.push(`status ${workState==='closed'?'IN':'NOT IN'} ${terminal}`);
  }
  const statement=db.prepare(`SELECT * FROM ${source.table}${conditions.length?` WHERE ${conditions.join(' AND ')}`:''} ORDER BY ${source.order} LIMIT ${id===null?500:1}`).bind(...values);
  return statement.all<Record<string,unknown>>();
}
