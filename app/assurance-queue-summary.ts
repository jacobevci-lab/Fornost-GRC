export function assuranceQueueSummary(items:ReadonlyArray<{action:string;status:string}>){
 const result={total:items.length,pendingReview:0,awaitingRetest:0,capaPromotion:0,retest:0,failedRetest:0,retestError:0,completed:0,rejected:0};
 for(const item of items){
  if(item.status==='pending-review'){
   result.pendingReview++;
   if(item.action==='capa-promotion')result.capaPromotion++;
   if(item.action==='control-retest')result.retest++;
  }else if(item.status==='approved-awaiting-retest')result.awaitingRetest++;
  else if(item.status==='failed-retest')result.failedRetest++;
  else if(item.status==='retest-error')result.retestError++;
  else if(item.status==='completed')result.completed++;
  else if(item.status==='rejected')result.rejected++;
 }
 return result;
}
