import {commitLifecycle,lifecycleClaim,lifecycleInsert,nextLifecycleStamp,LifecycleConflict} from "../enterprise-lifecycle-write";

export const scopeEventSql="SELECT e.action FROM third_party_events e WHERE e.vendor_id=r.id AND e.action IN ('scope-excluded','scope-restored') ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1";
export async function decideVendorScope(db:D1Database,body:Record<string,unknown>,actor:{role:string;email:string}){
  if(actor.role!=="Admin")return {status:403,code:"SCOPE_ACCESS"};
  const exclude=body.action==="exclude-vendor",reason=typeof body.reason==="string"?body.reason.trim():"";
  if(typeof body.vendorId!=="string" || !body.vendorId || typeof body.expectedRevision!=="string" || (exclude && !reason) || reason.length>1200)return {status:400,code:"SCOPE_INPUT"};
  const row=await db.prepare("SELECT * FROM simple_grc_records WHERE module='Tedarikçiler' AND id=?").bind(body.vendorId).first<Record<string,string>>();
  if(!row || row.updated_at!==body.expectedRevision)throw new LifecycleConflict();
  const now=nextLifecycleStamp(row.updated_at);
  const guard={sql:"NOT EXISTS(SELECT 1 FROM third_party_profiles WHERE vendor_id=?) AND coalesce((SELECT action FROM third_party_events WHERE vendor_id=? AND action IN ('scope-excluded','scope-restored') ORDER BY created_at DESC,rowid DESC LIMIT 1),'') "+(exclude?"<>":"=")+"'scope-excluded'",values:[row.id,row.id]};
  await commitLifecycle(db,lifecycleClaim(db,"simple_grc_records","updated_at=?",[now],row,guard),[
    lifecycleInsert(db,"third_party_events",{id:crypto.randomUUID(),vendor_id:row.id,action:exclude?"scope-excluded":"scope-restored",detail:reason,actor:actor.email,created_at:now})
  ]);
  return {status:200,code:"SCOPE_SAVED"};
}
