import {workNames,type PolicyWorkPage,type PolicyWorkItem} from "./worklist";
import {PolicyDecisionError} from "./decision-store";

type Actor={role:string;email:string};
const pageSize=25;

export async function readPolicyWorklist(db:D1Database,actor:Actor,params:URLSearchParams):Promise<PolicyWorkPage>{
  const scope=params.get("scope")||"mine",lang=params.get("lang")||"tr";
  const search=(params.get("q")||"").trim(),pageText=params.get("page")||"1";
  if(!["mine","org"].includes(scope)||!["tr","en"].includes(lang)||search.length>200||!/^\d{1,6}$/.test(pageText)||Number(pageText)<1)throw new PolicyDecisionError("POLICY_DECISION_INPUT",400);
  if(scope==="org"&&actor.role==="Viewer")throw new PolicyDecisionError("POLICY_DECISION_ACCESS",403);
  const mine=scope==="mine";
  const branches:string[]=[];
  if(actor.role!=="Viewer")branches.push(
    `SELECT 'first',p.id,p.id,NULL,p.owner,NULL,'' FROM policy_documents p WHERE p.status='draft' AND NOT EXISTS
      (SELECT 1 FROM policy_versions v WHERE v.policy_id=p.id AND v.status IN ('draft','review','approved','published'))`,
    `SELECT v.status,v.id,v.policy_id,v.version_number,CASE WHEN v.status='draft' THEN p.owner ELSE p.reviewer END,NULL,v.summary
      FROM policy_versions v JOIN policy_documents p ON p.id=v.policy_id WHERE p.status!='retired' AND v.status IN ('draft','review','approved')`,
    `SELECT 'periodic',p.id,p.id,v.version_number,p.reviewer,p.next_review,''
      FROM policy_documents p JOIN policy_versions v ON v.id=p.current_version_id AND v.policy_id=p.id
      WHERE p.status='published' AND v.status='published' AND p.next_review!='' AND p.next_review<=date('now','+30 days')`,
    `SELECT CASE e.status WHEN 'draft' THEN 'exceptionDraft' WHEN 'submitted' THEN 'exceptionReview' ELSE 'expiry' END,
      e.id,e.policy_id,v.version_number,CASE WHEN e.status='submitted' THEN e.reviewer ELSE e.owner END,e.expires_at,e.scope
      FROM policy_exceptions e JOIN policy_versions v ON v.id=e.version_id AND v.policy_id=e.policy_id
      JOIN policy_documents p ON p.id=e.policy_id WHERE p.status!='retired' AND
      (e.status IN ('draft','submitted') OR (e.status='approved' AND e.expires_at<=date('now','+30 days')))`
  );
  if(mine)branches.push(`SELECT 'response',a.id,c.policy_id,v.version_number,a.subject_email,c.due_date,c.name
    FROM policy_attestations a JOIN policy_attestation_campaigns c ON c.id=a.campaign_id
    JOIN policy_versions v ON v.id=c.version_id AND v.policy_id=c.policy_id
    JOIN policy_documents p ON p.id=c.policy_id WHERE a.status='pending' AND c.status='open' AND p.status!='retired' AND lower(a.subject_email)=lower(?)`);
  if(!mine&&actor.role==="Admin")branches.push(`SELECT 'campaign',c.id,c.policy_id,v.version_number,c.created_by,c.due_date,c.name
    FROM policy_attestation_campaigns c JOIN policy_versions v ON v.id=c.version_id AND v.policy_id=c.policy_id WHERE c.status='open'`);
  const stem=`WITH work(kind,id,policyId,versionNumber,responsible,due,detail) AS (${branches.join(" UNION ALL ")})
    SELECT w.*,p.title,p.code FROM work w JOIN policy_documents p ON p.id=w.policyId`;
  const filters=mine?["lower(w.responsible)=lower(?)"]:[];const values:string[]=mine?[actor.email,actor.email]:[];
  if(search){
    const labels=Object.keys(workNames).map(kind=>`WHEN '${kind}' THEN ?`).join(" ");
    let txt=`p.code||' '||p.title||' '||w.responsible||' '||coalesce(w.detail,'')||' '||CASE w.kind ${labels} END`;
    for(const [upper,lower] of lang==="tr"?[["I","ı"],["İ","i"],["Ş","ş"],["Ü","ü"],["Ö","ö"],["Ğ","ğ"],["Ç","ç"]]:[["İ","i̇"]])txt=`replace(${txt},'${upper}','${lower}')`;
    filters.push(`instr(lower(${txt}),?)>0`);values.push(...Object.values(workNames).map(names=>names[lang==="tr"?0:1]),search.toLocaleLowerCase(lang==="tr"?"tr-TR":"en-US"));
  }
  const query=stem+(filters.length?" WHERE "+filters.join(" AND "):"");
  const count=`SELECT count(*) AS n FROM (${query})`;
  const requested=Number(pageText);
  const [counts,records,metrics]=await db.batch<Record<string,unknown>>([
    db.prepare(count).bind(...values),
    db.prepare(`${query} ORDER BY CASE WHEN w.due<date('now') THEN 0 WHEN w.kind IN ('review','exceptionReview','approved') THEN 1 ELSE 2 END,
      w.due IS NULL,w.due,p.code,w.kind,w.id LIMIT 25 OFFSET (MAX(0,MIN(?,CAST(((${count})-1)/25 AS INTEGER)))*25)`).bind(...values,requested-1,...values),
    db.prepare(`SELECT (SELECT count(*) FROM policy_attestation_campaigns c WHERE c.status='open' ${mine?" AND EXISTS (SELECT 1 FROM policy_attestations a WHERE a.campaign_id=c.id AND lower(a.subject_email)=lower(?))":""}) AS openCampaigns,
      (SELECT count(*) FROM policy_attestations a JOIN policy_attestation_campaigns c ON c.id=a.campaign_id WHERE a.status='pending' AND c.status='open'
        ${mine?" AND lower(a.subject_email)=lower(?)":""}) AS pendingResponses`).bind(...(mine?[actor.email,actor.email]:[]))
  ]);
  const total=Number(counts.results[0].n),pages=Math.max(1,Math.ceil(total/pageSize));
  return {rows:records.results as unknown as PolicyWorkItem[],total,pages,page:Math.min(requested,pages),
    openCampaigns:Number(metrics.results[0].openCampaigns),pendingResponses:Number(metrics.results[0].pendingResponses)};
}
