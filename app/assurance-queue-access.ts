export function canReviewAssuranceWork(role:string,email:string,item:{status:string;actor:string},decision:'approve'|'reject',note:string) {
 const identity=email.trim().toLowerCase(),requester=item.actor.trim().toLowerCase();
 return role==='Admin'&&!!identity&&!!requester&&identity!==requester&&item.status==='pending-review'&&(decision==='approve'||note.trim().length>=10)&&note.trim().length<=1200;
}
export function validAssuranceQueue(body:Record<string,unknown>):boolean {
 const required=['id','findingId','ruleId','action','status','findingTitle','severity','owner','dueDate','ruleName','controlRefs','updatedAt','actor'];
 const optional=['targetControlRef','createdAt','reviewedBy','reviewedAt','reviewNote','resultRef','resultCode','completedAt'];
 return Array.isArray(body.items)&&body.items.every(row=>row&&typeof row==='object'&&required.every(key=>typeof row[key]==='string')&&optional.every(key=>row[key]==null||typeof row[key]==='string'))
  &&!!body.summary&&typeof body.summary==='object'&&['total','pendingReview','awaitingRetest','capaPromotion','retest','failedRetest','retestError','completed','rejected'].every(key=>Number.isFinite((body.summary as Record<string,unknown>)[key]));
}
