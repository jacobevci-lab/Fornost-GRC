import {canonicalCoreReferenceValues,coreReferenceGuard,CoreReferenceUnavailable} from './core-reference-write';

type Row=Record<string,string|number|null>;
type Link={field:string;modules:string[]};
const identifier=(value:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error('Invalid intake identifier');return value};

/** Internal rows/field definitions only. The guarded source insert and its history share one transaction. */
export async function insertReferencedEnterpriseRecord(db:D1Database,table:string,row:Row,links:Link[],history:D1PreparedStatement[]){
 if(!row.id)throw new Error('Intake identity required');
 const guard=coreReferenceGuard(links.flatMap(({field,modules})=>canonicalCoreReferenceValues(row[field]).map(value=>({sourceId:String(row.id),field,value,modules}))));
 const claim=db.prepare(`INSERT INTO ${identifier(table)}(${Object.keys(row).map(identifier).join(',')}) SELECT ${Object.keys(row).map(()=>'?').join(',')} WHERE ${guard.sql}`)
 .bind(...Object.values(row),...guard.values);
 const results=await db.batch([claim,...history]);
 if(Number(results[0]?.meta?.changes||0)!==1)throw new CoreReferenceUnavailable();
}
