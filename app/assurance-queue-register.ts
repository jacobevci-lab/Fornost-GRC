import {missingAssuranceContextTable,type AssuranceSourceState} from "./assurance-queue-context";
import {assuranceQueueSearchExpression,type AssuranceQueueSearch} from "./assurance-queue-search";
import {assuranceQueueCursor,parseAssuranceQueueCursor} from "./assurance-queue-cursor";
const sourceState=`CASE WHEN f.id IS NULL THEN 'missing-finding' WHEN r.id IS NULL THEN 'missing-rule' WHEN f.rule_id IS NOT w.rule_id THEN 'rule-mismatch' ELSE 'linked' END source_state`;
export async function readAssuranceSourceState(db:D1Database,workItemId:string):Promise<AssuranceSourceState> {
 const row=await db.prepare(`SELECT ${sourceState} FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id WHERE w.id=?`).bind(workItemId).first<{source_state:AssuranceSourceState}>();
 return row?.source_state??'unavailable';
}
async function readRows<T>(db:D1Database,cursor?:string,search?:AssuranceQueueSearch){
  const priority="CASE w.status WHEN 'pending-review' THEN 0 WHEN 'approved-awaiting-retest' THEN 1 WHEN 'failed-retest' THEN 2 WHEN 'retest-error' THEN 3 ELSE 4 END";
  const parts=cursor?parseAssuranceQueueCursor(cursor):null;
  let where=parts?`WHERE (${priority}>? OR (${priority}=? AND (COALESCE(w.updated_at,'')<? OR (COALESCE(w.updated_at,'')=? AND w.id>?))))`:'';
  const values=parts?[parts[0],parts[0],parts[1],parts[1],parts[2]]:[];
  if(search?.query){where+=`${parts?' AND':'WHERE'} instr(${assuranceQueueSearchExpression(search.lang)},?)>0`;values.push(search.query.toLocaleLowerCase(search.lang==='tr'?'tr-TR':'en-US'));}
  const read=(query:string)=>{const statement=db.prepare(query);return (values.length?statement.bind(...values):statement).all<T>();};
  const order=`${where} ORDER BY ${priority},COALESCE(w.updated_at,'') DESC,w.id ASC LIMIT 501`;
  try{
    return {...await read(`SELECT w.*,${sourceState},f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs,ef.code result_code FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id LEFT JOIN enterprise_findings ef ON ef.id=w.result_ref ${order}`),context:"full" as const};
  }catch(error){
    if(search?.query||!missingAssuranceContextTable(error))throw error; // Never silently search a reduced set of fields.
    try{
      return {...await read(`SELECT w.*,${sourceState},f.title finding_title,f.severity finding_severity,f.owner finding_owner,f.due_date finding_due_date,r.name rule_name,r.control_refs control_refs FROM continuous_assurance_work_items w LEFT JOIN evidence_automation_findings f ON f.id=w.finding_id LEFT JOIN evidence_automation_rules r ON r.id=w.rule_id ${order}`),context:"without-capa" as const};
    }catch(error){
      if(!missingAssuranceContextTable(error))throw error;
      return {...await read(`SELECT w.*,'unavailable' source_state FROM continuous_assurance_work_items w ${order}`),context:"work-only" as const};
    }
  }
}

export const ASSURANCE_QUEUE_LIMIT = 500;
export async function readAssuranceQueue<T>(db:D1Database,cursor?:string,search?:AssuranceQueueSearch) {
  const result=await readRows<T>(db,cursor,search);
  const rows=result.results.slice(0,ASSURANCE_QUEUE_LIMIT);
  const nextCursor=result.results.length>ASSURANCE_QUEUE_LIMIT?assuranceQueueCursor(rows.at(-1) as {status:string;updated_at:string;id:string}):null;
  return {rows,nextCursor,context:result.context,coverage:{loaded:rows.length,complete:result.results.length<=ASSURANCE_QUEUE_LIMIT}};
}
