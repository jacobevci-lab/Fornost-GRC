/** Exact context references only; legacy inventory events used an ID-prefixed detail. */
export function readAiRecordHistory(db:D1Database,id:string|null,limit:number){
 const refs="CASE WHEN json_valid(context_refs_json) THEN CASE WHEN json_type(context_refs_json)='array' THEN context_refs_json ELSE '[]' END ELSE '[]' END";
 const where=id===null?'':`WHERE EXISTS(SELECT 1 FROM json_each(${refs}) ref WHERE ref.type='text' AND ref.value=?)
  OR (action IN ('model-inventory-create','model-inventory-edit','model-inventory-delete','model-inventory-approved','model-inventory-suspended') AND substr(detail,1,length(?)+1)=? || ' ')`;
 const statement=db.prepare(`SELECT id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at FROM ai_activity_logs ${where} ORDER BY created_at DESC,id DESC LIMIT ?`);
 return statement.bind(...(id===null?[]:[id,id,id]),limit+1).all<Record<string,unknown>>();
}
