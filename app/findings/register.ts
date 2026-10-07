export const FINDING_REGISTER_LIMIT = 3000;
/** Counts cover the canonical register, including records outside the bounded UI list. */
export async function readFindingRegister(db: D1Database, day = new Date().toISOString().slice(0,10), includeRows=true) {
 const [rows, counts] = await db.batch([
  db.prepare("SELECT * FROM enterprise_findings ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_date,updated_at DESC,id LIMIT ?").bind(includeRows?FINDING_REGISTER_LIMIT:0),
  findingSummaryStatement(db,day),
 ]);
 const summary=counts.results[0] as Record<string,number>;
 return {rows:rows.results as Record<string,unknown>[],summary,coverage:{loaded:rows.results.length,total:summary.total,truncated:summary.total>rows.results.length}};
}

export class FindingRegisterError extends Error {constructor(message:string,public status=400){super(message);}}
export type FindingRegisterQuery={query:string;filter:string;page:number;lang:'tr'|'en';ref?:string;assignment?:'owned'|'review'};
export function parseFindingRegisterQuery(params:URLSearchParams):FindingRegisterQuery{
 const assignment=params.get('assignment')||'all';
 const ref=params.get('ref')||'',query=(params.get('q')||'').trim(),filter=params.get('filter')||'all',raw=params.get('page')||'1',lang=params.get('lang')||'tr';
 if(!['all','owned','review'].includes(assignment)||ref.length>200||/\p{Cc}/u.test(ref)||query.length>200||!['all','active','open','in-progress','critical','recurring','acceptance-expired','priority','overdue','verification','accepted','closed'].includes(filter)||!/^[1-9]\d{0,7}$/.test(raw)||!['tr','en'].includes(lang))throw new FindingRegisterError('Invalid finding search or page');
 return {query,filter,page:Number(raw),lang:lang as 'tr'|'en',...(ref?{ref}: {}),...(assignment!=='all'?{assignment:assignment as 'owned'|'review'}:{})};
}
function searchExpression(lang:'tr'|'en'){
 let expression="COALESCE(code,'')||' '||COALESCE(title,'')||' '||COALESCE(source_ref,'')||' '||COALESCE(owner,'')";
 // SQLite lower() is ASCII-only. Normalize the Turkish letters explicitly.
 const pairs=lang==='tr'?[['I','ı'],['İ','i'],['Ç','ç'],['Ğ','ğ'],['Ö','ö'],['Ş','ş'],['Ü','ü']]:[['İ','i̇'],['Ç','ç'],['Ğ','ğ'],['Ö','ö'],['Ş','ş'],['Ü','ü']];
 for(const [upper,lower] of pairs)expression=`replace((${expression}),'${upper}','${lower}')`;
 return `lower(${expression})`;
}
export async function readFindingRegisterPage(db:D1Database,input:FindingRegisterQuery,now=new Date(),actorEmail?:string){
 const day=now.toISOString().slice(0,10),where=['1=1'],values:(string|number)[]=[];
 if(input.assignment){
  if(!actorEmail)throw new FindingRegisterError('Authenticated assignment context required',400);
  where.push(input.assignment==='owned'?'owner=?':'reviewer=?');values.push(actorEmail);
 }
 if(input.ref){where.push('(id=? OR code=?)');values.push(input.ref,input.ref);}
 if(input.query){where.push(`instr(${searchExpression(input.lang)},?)>0`);values.push(input.query.toLocaleLowerCase(input.lang==='tr'?'tr-TR':'en-US'));}
 if(input.filter==='overdue'){where.push("((status NOT IN ('closed','accepted') AND due_date<?) OR (status='accepted' AND accept_until!='' AND accept_until<?))");values.push(day,day);}
 else if(input.filter==='priority'){where.push("status NOT IN ('closed','accepted') AND due_date>=? AND (severity IN ('critical','high') OR julianday(due_date||'T23:59:59Z')-julianday(?)<=7)");values.push(day,now.toISOString());}
 else if(input.filter==='active')where.push("status NOT IN ('closed','accepted')");
 else if(input.filter==='critical')where.push("severity='critical' AND status!='closed'");
 else if(input.filter==='recurring')where.push('recurrence_count>0');
 else if(input.filter==='acceptance-expired'){where.push("status='accepted' AND accept_until!='' AND accept_until<?");values.push(day);}
 else if(input.filter!=='all'){where.push('status=?');values.push(input.filter);}
 const condition=where.join(' AND '),count=`SELECT COUNT(*) FROM enterprise_findings WHERE ${condition}`;
 const [matches,rows,counts]=await db.batch([
  db.prepare(count+'').bind(...values),
  db.prepare(`SELECT * FROM enterprise_findings WHERE ${condition} ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_date,updated_at DESC,id LIMIT 20 OFFSET (MAX(0,MIN(?,CAST(((${count})-1)/20 AS INTEGER)))*20)`).bind(...values,input.page-1,...values),
  findingSummaryStatement(db,day),
 ]);
 const total=Number(Object.values(matches.results[0]||{})[0]||0),pages=Math.max(1,Math.ceil(total/20)),page=Math.min(input.page,pages);
 if(input.ref&&total>1)throw new FindingRegisterError('Ambiguous finding reference',409);
 return {summary:counts.results[0] as Record<string,number>,rows:rows.results as Record<string,unknown>[],pagination:{page,pages,total,start:total?(page-1)*20+1:0,end:Math.min(page*20,total)}};
}

function findingSummaryStatement(db:D1Database,day:string){return db.prepare(`SELECT COUNT(*) total,
   COALESCE(SUM(status NOT IN ('closed','accepted')),0) open,
   COALESCE(SUM(severity='critical' AND status!='closed'),0) critical,
   COALESCE(SUM((status NOT IN ('closed','accepted') AND due_date<?) OR (status='accepted' AND accept_until IS NOT NULL AND accept_until!='' AND accept_until<?)),0) overdue,
   COALESCE(SUM(status='verification'),0) verification,
   COALESCE(SUM(status='accepted'),0) accepted,
   COALESCE(SUM(status='closed'),0) closed,
   COALESCE(SUM(recurrence_count>0),0) recurring FROM enterprise_findings`).bind(day,day);}
