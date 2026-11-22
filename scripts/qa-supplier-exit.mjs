// Isolated QA callers prepare their own supplier before the separate reviewer confirms exit.
export async function prepareQaSupplierExit(api,owner,vendorId,choice){
 const path='/api/third-party-risk';
 const revision=async()=>(await api(owner,path)).profiles.find(v=>v.vendorId===vendorId).updatedAt;
 await api(owner,path,'POST',{action:'start-exit',vendorId,expectedRevision:await revision()});
 await api(owner,path,'POST',{action:'save-exit',vendorId,expectedRevision:await revision(),accessRevoked:true,dataReturned:true,...choice});
 return revision();
}
