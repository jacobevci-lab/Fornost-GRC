import {LifecycleConflict,nextLifecycleStamp} from './enterprise-lifecycle-write';

export type CoreRecordSnapshot={data_json:string;updated_at:string};
/** Optional for older API clients; the product's edit forms always send their loaded version. */
export async function writeCoreRecord(db:D1Database,id:string,existing:CoreRecordSnapshot,data:Record<string,unknown>,expectedUpdatedAt:unknown){
 if(expectedUpdatedAt!==undefined){
  if(typeof expectedUpdatedAt!=='string'||!expectedUpdatedAt||expectedUpdatedAt.length>64)throw new Error('Geçersiz kayıt sürümü.');
  if(expectedUpdatedAt!==existing.updated_at)throw new LifecycleConflict();
 }
 const updatedAt=nextLifecycleStamp(existing.updated_at);
 const result=await db.prepare('UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND data_json=? AND updated_at=?')
  .bind(JSON.stringify(data),updatedAt,id,existing.data_json,existing.updated_at).run();
 if(Number(result.meta?.changes||0)!==1)throw new LifecycleConflict();
 return updatedAt;
}
