export type FindingHistoryEvent={id:string;findingId:string;action:string;fromStatus:string|null;toStatus:string|null;detail:string;actor:string;createdAt:string;evidenceReference:string|null;evidenceSha256:string|null};
export class FindingHistoryError extends Error { constructor(message:string,public status:number){super(message);} }
export async function readFindingHistory(db:D1Database,findingId:string,after:string|null,stamp:string|null){
 if(!findingId||findingId.length>200||(after===null)!==(stamp===null)||(after!==null&&(!after||after.length>200||!stamp||stamp.length>40||!Number.isFinite(Date.parse(stamp)))))throw new FindingHistoryError('Invalid history cursor',400);
 const exists=await db.prepare('SELECT id FROM enterprise_findings WHERE id=?').bind(findingId).first();
 if(!exists)throw new FindingHistoryError('Finding not found',404);
 const result=await db.prepare(`SELECT * FROM enterprise_finding_events WHERE finding_id=? ${after===null?'':'AND (created_at<? OR (created_at=? AND id<?))'} ORDER BY created_at DESC,id DESC LIMIT 51`)
  .bind(...(after===null?[findingId]:[findingId,stamp,stamp,after])).all<Record<string,unknown>>();
 const rows=result.results.slice(0,50);
 const events:FindingHistoryEvent[]=rows.map(r=>({id:String(r.id),findingId:String(r.finding_id),action:String(r.action),fromStatus:r.from_status as string|null,toStatus:r.to_status as string|null,detail:String(r.detail),actor:String(r.actor),createdAt:String(r.created_at),evidenceReference:r.evidence_reference as string|null,evidenceSha256:r.evidence_sha256 as string|null}));
 const last=events.at(-1);
 return {events,next:result.results.length>50&&last?{after:last.id,stamp:last.createdAt}:null};
}
