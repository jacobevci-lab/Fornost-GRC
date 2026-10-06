/** D1 batches are transactional: the guarded update and its audit event commit together. */
export async function commitFindingTransition(db:D1Database, update:D1PreparedStatement, event:{findingId:string;action:string;from:string;to:string;detail:string;evidenceReference?:string;evidenceSha256?:string;actor:string;stamp:string}) {
 const results=await db.batch([update,db.prepare("INSERT INTO enterprise_finding_events(id,finding_id,action,from_status,to_status,detail,evidence_reference,evidence_sha256,actor,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1")
  .bind(crypto.randomUUID(),event.findingId,event.action,event.from,event.to,event.detail.slice(0,2000),event.evidenceReference||null,event.evidenceSha256||null,event.actor,event.stamp)]);
 return results.length===2&&results.every(result=>result.success===true&&Number(result.meta?.changes)===1);
}
