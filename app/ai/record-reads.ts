/** Exact navigation reads remain independent of the bounded list projection. */
export function aiRecordQueryId(params:URLSearchParams):string|null {
  const ids=params.getAll('id');
  if(!ids.length)return null;
  const id=ids[0];
  if(ids.length!==1||!id||id!==id.trim()||id.length>100||/[\u0000-\u001f\u007f]/.test(id))throw new Error('Geçerli bir kayıt kimliği gereklidir.');
  return id;
}
const sources={
  models:{table:'ai_model_inventory',order:"CASE risk_tier WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,review_date"},
  alerts:{table:'ai_assurance_alerts',order:"CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,last_seen_at DESC"},
  findings:{table:'ai_findings',order:"CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,due_date,updated_at DESC"},
} as const;
export function readAiRecords(db:D1Database,kind:keyof typeof sources,id:string|null){
  const source=sources[kind];
  const statement=id===null?db.prepare(`SELECT * FROM ${source.table} ORDER BY ${source.order} LIMIT 500`):db.prepare(`SELECT * FROM ${source.table} WHERE id=? LIMIT 1`).bind(id);
  return statement.all<Record<string,unknown>>();
}
