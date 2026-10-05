/** The audit is inserted only when this batch's model write changed one row. */
export async function commitAiModelWrite(db:D1Database,write:D1PreparedStatement,event:{id:string;actor:string;action:string;detail:string;at:string}){
 const results=await db.batch([write,db.prepare(`INSERT INTO ai_activity_logs(id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at)
  SELECT ?,?,?,'','',NULL,?,'success',0,?,? WHERE changes()=1`)
  .bind(crypto.randomUUID(),event.actor,event.action,JSON.stringify([event.id]),event.detail,event.at)]);
 return Number(results[0]?.meta?.changes||0)===1;
}
