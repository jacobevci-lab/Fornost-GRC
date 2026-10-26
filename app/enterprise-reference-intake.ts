import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from './core-reference-write';
import {commitLifecycle,LifecycleConflict} from './enterprise-lifecycle-write';

type Row=Record<string,string|number|null>;
type Link={field:string;modules:string[]};
const identifier=(value:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error('Invalid intake identifier');return value};

/** Internal rows/field definitions only. The guarded source insert and its history share one transaction. */
export async function insertReferencedEnterpriseRecord(db:D1Database,table:string,row:Row,links:Link[],history:D1PreparedStatement[],extraGuard?:{sql:string;values:unknown[]}){
 if(!row.id)throw new Error('Intake identity required');
 const guard=coreReferenceGuard(links.flatMap(({field,modules})=>canonicalCoreReferenceValues(row[field]).map(value=>({sourceId:String(row.id),field,value,modules}))));
 const claim=db.prepare(`INSERT INTO ${identifier(table)}(${Object.keys(row).map(identifier).join(',')}) SELECT ${Object.keys(row).map(()=>'?').join(',')} WHERE (${guard.sql})${extraGuard?` AND (${extraGuard.sql})`:""}`)
 .bind(...Object.values(row),...guard.values,...(extraGuard?.values||[]));
 const results=await db.batch([claim,...history]);
 if(Number(results[0]?.meta?.changes||0)!==1){if(extraGuard&&(await db.prepare(`SELECT ${guard.sql} AS available`).bind(...guard.values).first<{available:number}>())?.available===1)throw new LifecycleConflict();throw new CoreReferenceUnavailable();}
}

/** Caller includes this guard in the claim. Diagnose a rejected transaction without relaxing its snapshot checks. */
export async function commitReferencedLifecycle(db:D1Database,claim:D1PreparedStatement,history:D1PreparedStatement[],guard:ReturnType<typeof coreReferenceGuard>){
 try{await commitLifecycle(db,claim,history)}catch(error){
  if(error instanceof LifecycleConflict){
   const current=await db.prepare(`SELECT ${guard.sql} AS available`).bind(...guard.values).first<{available:number}>();
   if(current?.available===0)throw new CoreReferenceUnavailable();
  }
  throw error;
 }
}
