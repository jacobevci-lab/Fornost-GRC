import {LifecycleConflict,nextLifecycleStamp} from './enterprise-lifecycle-write';
import {checkSideConflict,coreWriteGuard,CoreReferenceUnavailable,type CoreSideEffect} from './core-reference-write';

export type CoreRecordSnapshot={data_json:string;updated_at:string};
/** Optional for older API clients; the product's edit forms always send their loaded version. */
export async function writeCoreRecord(db:D1Database,id:string,existing:CoreRecordSnapshot&{module:string},data:Record<string,unknown>,expectedUpdatedAt:unknown,side?:CoreSideEffect){
 if(expectedUpdatedAt!==undefined){
  if(typeof expectedUpdatedAt!=='string'||!expectedUpdatedAt||expectedUpdatedAt.length>64)throw new Error('Geçersiz kayıt sürümü.');
  if(expectedUpdatedAt!==existing.updated_at)throw new LifecycleConflict();
 }
 const updatedAt=nextLifecycleStamp(existing.updated_at);
 const guard=coreWriteGuard(existing.module,[{id,data,before:JSON.parse(existing.data_json)}]);
 const write=db.prepare(`UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module=? AND data_json=? AND updated_at=? AND (${guard.sql})${side?' AND ('+side.guard.sql+')':''}`)
  .bind(JSON.stringify(data),updatedAt,id,existing.module,existing.data_json,existing.updated_at,...guard.values,...(side?.guard.values||[]));
 const result=side?(await db.batch([write,side.after]))[0]:await write.run();
 // The primary-key guard changes at most one source row; D1 also counts AFTER-trigger writes.
 if(Number(result.meta?.changes||0)<1){
  await checkSideConflict(db,side);
  if(!(await db.prepare(`SELECT 1 valid WHERE ${guard.sql}`).bind(...guard.values).first()))throw new CoreReferenceUnavailable();
  throw new LifecycleConflict();
 }
 return updatedAt;
}
