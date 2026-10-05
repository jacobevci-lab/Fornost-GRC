export const auditPlanFields=['objective','scope','exclusions','lead','team','methodology','deliverables','milestones','periodStart','periodEnd','fieldworkStart','fieldworkEnd'] as const;
export type AuditPlan=Record<typeof auditPlanFields[number],string>;
export const emptyAuditPlan=Object.fromEntries(auditPlanFields.map(key=>[key,''])) as AuditPlan;
export function validateAuditPlan(input:unknown):AuditPlan{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid plan');
 const data=input as Record<string,unknown>,plan={...emptyAuditPlan};
 for(const key of auditPlanFields){const value=data[key];if(typeof value!=='string'||value.length>4000)throw new Error('Invalid plan field');plan[key]=value.trim();}
 for(const key of ['periodStart','periodEnd','fieldworkStart','fieldworkEnd'] as const){const date=plan[key];if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('Invalid date');}
 for(const[start,end]of [['periodStart','periodEnd'],['fieldworkStart','fieldworkEnd']]as const)if(Boolean(plan[start])!==Boolean(plan[end])||(plan[start]&&plan[start]>plan[end]))throw new Error('Invalid date range');
 return plan;
}
export async function saveAuditPlan(db:D1Database,id:string,expectedRevision:string,plan:AuditPlan,actor:string){
 const revision=crypto.randomUUID(),updatedAt=new Date().toISOString(),value=JSON.stringify({plan,revision,updatedAt,updatedBy:actor});
 const result=await db.prepare(`INSERT INTO simple_grc_metadata(key,value,updated_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?) AND (?='' OR EXISTS(SELECT 1 FROM simple_grc_metadata WHERE key=?)) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(simple_grc_metadata.value,'$.revision')=? RETURNING key`).bind(`audit_plan_${id}`,value,updatedAt,id,expectedRevision,`audit_plan_${id}`,expectedRevision).all();
 return result.results?.length?{plan,revision,updatedAt,updatedBy:actor}:null;
}
