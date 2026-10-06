export type EscalationSearchRow = { id:string; status:string; severity:string; kind:string; title:string; detail:string; owner:string; subjectRef:string };
export function escalationListPage<T extends EscalationSearchRow>(records:T[], filter:string, query:string, requestedPage:number, lang:"tr"|"en") {
  const normalize=(value:string)=>value.toLocaleLowerCase(lang==="tr"?"tr-TR":"en-US");
  const needle=normalize(query.trim());
  const matches=records.filter(item=>{
    const matchesFilter=filter==="all"?true:filter==="open"?item.status!=="resolved":filter==="critical"?item.status!=="resolved"&&item.severity==="critical":filter==="ack"?item.status==="acknowledged":item.kind===filter;
    return matchesFilter&&(!needle||normalize([item.id,item.title,item.detail,item.owner,item.subjectRef].join(" ")).includes(needle));
  });
  const size=20,pages=Math.max(1,Math.ceil(matches.length/size));
  const page=Math.min(pages,Math.max(1,Number.isFinite(requestedPage)?Math.floor(requestedPage):1));
  const offset=(page-1)*size;
  return {rows:matches.slice(offset,offset+size),page,pages,total:matches.length,start:matches.length?offset+1:0,end:Math.min(offset+size,matches.length)};
}
export function canAcknowledgeEscalation(role:string,status:string,note:string) {
  return (role==="Admin"||role==="Editor")&&status==="active"&&note.trim().length>=10&&note.trim().length<=1200;
}
