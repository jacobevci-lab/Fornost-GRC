import {assuranceQueueSearchExpression,type AssuranceQueueSearch} from "./assurance-queue-search";
import {assuranceQueueCursor,parseAssuranceQueueCursor} from "./assurance-queue-cursor";
async function readRows<T>(db:D1Database,cursor?:string,search?:AssuranceQueueSearch){
  const priority="CASE w.status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END";
  const parts=cursor?parseAssuranceQueueCursor(cursor):null;
  let where=parts?`WHERE (${priority}>? OR (${priority}=? AND (COALESCE(w.updated_at,'')<? OR (COALESCE(w.updated_at,'')=? AND w.id>?))))`:'';
  const values=parts?[parts[0],parts[0],parts[1],parts[1],parts[2]]:[];
  if(search?.query){where+=`${parts?' AND':'WHERE'} instr(${assuranceQueueSearchExpression(search.lang)},?)>0`;values.push(search.query.toLocaleLowerCase(search.lang==='tr'?'tr-TR':'en-US'));}
  const read=(query:string)=>{const statement=db.prepare(query);return (values.length?statement.bind(...values):statement).all<T>();};
  const order=`${where} ORDER BY ${priority},COALESCE(w.updated_at,'') DESC,w.id ASC LIMIT 501`;
  try{
    return await read(`SELECT w.*,f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs,ef.code result_code FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id LEFT JOIN enterprise_findings ef ON ef.id=w.result_ref ${order}`);
  }catch(error){
    if(search?.query)throw error; // Never silently search a reduced set of fields.
    try{
      return await read(`SELECT w.*,f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id ${order}`);
    }catch{
      return read(`SELECT w.* FROM continuous_assurance_work_items w ${order}`);
    }
  }
}

export const ASSURANCE_QUEUE_LIMIT = 500;
export async function readAssuranceQueue<T>(db:D1Database,cursor?:string,search?:AssuranceQueueSearch) {
  const result=await readRows<T>(db,cursor,search);
  const rows=result.results.slice(0,ASSURANCE_QUEUE_LIMIT);
  const nextCursor=result.results.length>ASSURANCE_QUEUE_LIMIT?assuranceQueueCursor(rows.at(-1) as {status:string;updated_at:string;id:string}):null;
  return {rows,nextCursor,coverage:{loaded:rows.length,complete:result.results.length<=ASSURANCE_QUEUE_LIMIT}};
}
